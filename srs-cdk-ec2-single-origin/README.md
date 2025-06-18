# srs-cdk-ec2-single-origin

This is an AWS CDK project to deploy a SRS origin server to an EC2 instance.

## Usage

Before anything else, you should set up your environment; refer to [Usage](../README.md#usage) 
for details.

Afterwards, you can deploy this project by executing:

```bash
cdk deploy
```

AWS cloud resources created:

* An EIP public IPv4 address.
* An EC2 instance with EIP IPv4 address.
* An IAM role allows you to log in using AWS Session Manager.

Exposed ports resources:

* `tcp://1935`, for [RTMP](https://ossrs.io/lts/en-us/docs/v7/doc/rtmp) live streaming server.
* `tcp://1985`, for [HTTP-API](https://ossrs.io/lts/en-us/docs/v7/doc/http-api) service.
* `tcp://8080`, HTTP live streaming server, [HTTP-FLV](https://ossrs.io/lts/en-us/docs/v7/doc/flv), [HLS](https://ossrs.io/lts/en-us/docs/v7/doc/hls), and players.
* `udp://8000`, for [WebRTC](https://ossrs.io/lts/en-us/docs/v7/doc/webrtc) WHIP/WHEP server.
* `udp://10080`, for [SRT](https://ossrs.io/lts/en-us/docs/v7/doc/srt) media server.
