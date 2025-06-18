import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class SrsCdkEc2SingleOriginStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC for the EC2 instance
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1, 
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    const sg = new ec2.SecurityGroup(this, 'SG', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow all inbound traffic',
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(1985), 'Allow HTTP API traffic');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(1935), 'Allow Media RTMP traffic');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080), 'Allow Media HTTP Streaming traffic');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(8000), 'Allow Media WebRTC traffic');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(10080), 'Allow Media SRT traffic');

    // Create an IAM role for login the EC2 instance using AWS Session Manager
    const role = new iam.Role(this, 'SSMRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );

    // Create an Elastic IP to assign a fixed public IP
    const eip = new ec2.CfnEIP(this, 'EIP', {
      domain: 'vpc',
    });

    // Create an EC2 instance.
    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO);
    const ubuntuImage = ec2.MachineImage.lookup({
      name: instanceType.architecture === ec2.InstanceArchitecture.ARM_64
        ? 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*'
        : 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'
    });

    const instance = new ec2.Instance(this, 'EC2', {
      vpc,
      instanceType: instanceType,
      machineImage: ubuntuImage,
      securityGroup: sg,
      role: role,
      // Enable public IP access for the instance.
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, 
      associatePublicIpAddress: false, // Use EIP to assign a fixed public IP.
      // Enable 1 minute detailed monitoring for the instance.
      detailedMonitoring: true,
      // Ensure user data changes trigger a replacement.
      userDataCausesReplacement: true,
    });

    new ec2.CfnEIPAssociation(this, 'EIPAsso', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });
    
    const userDataScript = `#!/bin/bash
      set -euxo pipefail
      apt-get update -y
      #
      # Install SSM Agent for Session Manager.
      snap install amazon-ssm-agent --classic
      snap list amazon-ssm-agent
      snap start amazon-ssm-agent
      snap services amazon-ssm-agent
      #
      # Install Docker.
      apt-get install -y docker.io
      #
      # Wait for EIP to be ready.
      for ((i=0; i<60; i++)); do
        EIP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || true)
        [[ -n "$EIP" ]] && break
        sleep 1
      done
      if [[ -z "$EIP" ]]; then
        echo "Failed to get EIP after 60 seconds."
        exit 1
      fi
      echo "EIP is ready, IP: $EIP"
      #
      # Start SRS container.
      ARGS="-e SRS_MAX_CONNECTIONS=1000 -e SRS_DAEMON=off -e SRS_IN_DOCKER=on"
      # For RTMP server.
      ARGS="$ARGS -p 1935:1935 -e SRS_LISTEN=1935"
      ARGS="$ARGS -e SRS_VHOST_PLAY_GOP_CACHE=on -e SRS_VHOST_PLAY_GOP_CACHE_MAX_FRAMES=2500"
      ARGS="$ARGS -e SRS_VHOST_PLAY_QUEUE_LENGTH=15 -e SRS_VHOST_PLAY_TIME_JITTER=full"
      ARGS="$ARGS -e SRS_VHOST_PLAY_ATC=off -e SRS_VHOST_PLAY_MIX_CORRECT=off"
      ARGS="$ARGS -e SRS_VHOST_PLAY_REDUCE_SEQUENCE_HEADER=off"
      # For HTTP API server.
      ARGS="$ARGS -p 1985:1985 -e SRS_HTTP_API_ENABLED=on -e SRS_HTTP_API_LISTEN=1985"
      ARGS="$ARGS -e SRS_HTTP_API_CROSSDOMAIN=on"
      # For HTTP streaming server.
      ARGS="$ARGS -p 8080:8080 -e SRS_HTTP_SERVER_ENABLED=on -e SRS_HTTP_SERVER_LISTEN=8080"
      ARGS="$ARGS -e SRS_HTTP_SERVER_CROSSDOMAIN=on"
      ARGS="$ARGS -e SRS_VHOST_HTTP_REMUX_ENABLED=on -e SRS_VHOST_HTTP_REMUX_DROP_IF_NOT_MATCH=off"
      ARGS="$ARGS -e SRS_VHOST_HTTP_REMUX_HAS_AUDIO=on -e SRS_VHOST_HTTP_REMUX_HAS_VIDEO=on"
      ARGS="$ARGS -e SRS_VHOST_HTTP_REMUX_GUESS_HAS_AV=off"
      ARGS="$ARGS -e SRS_VHOST_HTTP_REMUX_MOUNT=[vhost]/[app]/[stream].flv"
      # For HLS streaming.
      ARGS="$ARGS -e SRS_VHOST_HLS_ENABLED=on"
      ARGS="$ARGS -e SRS_VHOST_HLS_HLS_FRAGMENT=10 -e SRS_VHOST_HLS_HLS_WINDOW=50"
      ARGS="$ARGS -e SRS_VHOST_HLS_HLS_M3U8_FILE=[app]/[stream].m3u8"
      ARGS="$ARGS -e SRS_VHOST_HLS_HLS_TS_FILE=[app]/[stream]-[seq].ts"
      ARGS="$ARGS -e SRS_VHOST_HLS_HLS_CLEANUP=on -e SRS_VHOST_HLS_HLS_DISPOSE=120"
      ARGS="$ARGS -e SRS_VHOST_HLS_HLS_WAIT_KEYFRAME=on"
      # For SRT server.
      ARGS="$ARGS -p 10080:10080/udp -e SRS_SRT_SERVER_ENABLED=on -e SRS_SRT_SERVER_LISTEN=10080"
      ARGS="$ARGS -e SRS_VHOST_SRT_ENABLED=on -e SRS_VHOST_SRT_TO_RTMP=on"
      # For WebRTC server.
      ARGS="$ARGS -e CANDIDATE=$EIP -p 8000:8000/udp -e SRS_RTC_SERVER_ENABLED=on -e SRS_RTC_SERVER_LISTEN=8000"
      ARGS="$ARGS -e SRS_RTC_SERVER_PROTOCOL=udp -e SRS_RTC_SERVER_CANDIDATE=$EIP"
      ARGS="$ARGS -e SRS_RTC_SERVER_USE_AUTO_DETECT_NETWORK_IP=off -e SRS_RTC_SERVER_API_AS_CANDIDATES=off"
      ARGS="$ARGS -e SRS_RTC_SERVER_RESOLVE_API_DOMAIN=off -e SRS_RTC_SERVER_KEEP_API_DOMAIN=off"
      ARGS="$ARGS -e SRS_VHOST_RTC_ENABLED=on -e SRS_VHOST_RTC_NACK=on"
      ARGS="$ARGS -e SRS_VHOST_RTC_RTMP_TO_RTC=on -e SRS_VHOST_RTC_KEEP_BFRAME=off"
      ARGS="$ARGS -e SRS_VHOST_RTC_OPUS_BITRATE=64000 -e SRS_VHOST_RTC_RTC_TO_RTMP=on"
      ARGS="$ARGS -e SRS_VHOST_RTC_PLI_FOR_RTMP=5.0 -e SRS_VHOST_RTC_AAC_BITRATE=64000"
      # Setup logging.
      ARGS="$ARGS --log-driver=json-file --log-opt=max-size=500m --log-opt=max-file=3"
      ARGS="$ARGS --restart always -d --name srs"
      docker rm -f srs || echo yes
      docker run $ARGS ossrs/srs:6 ./objs/srs -e
      #
      # Some extra information.
      echo "Deploy on 2025-6-18 #1"
    `;
    instance.userData.addCommands(userDataScript);

    new cdk.CfnOutput(this, 'Usage', { value: `http://${eip.ref}:8080` });
    new cdk.CfnOutput(this, 'SSH', { value: `aws ssm start-session --region ${props?.env?.region} --target ${instance.instanceId}` });
    new cdk.CfnOutput(this, 'RTMP', { value: `rtmp://${eip.ref}/live/livestream` });
    new cdk.CfnOutput(this, 'HTTP-FLV', { value: `http://${eip.ref}:8080/live/livestream.flv` });
    new cdk.CfnOutput(this, 'WHIP', { value: `http://${eip.ref}:1985/rtc/v1/whip/?app=live&stream=livestream` });
    new cdk.CfnOutput(this, 'WHEP', { value: `http://${eip.ref}:1985/rtc/v1/whep/?app=live&stream=livestream` });
  }
}
