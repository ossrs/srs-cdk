# srs-cdk

AWS CDK for SRS

##  Usage

Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then configure the credentials:

```bash
aws configure set region us-west-2
aws configure set aws_access_key_id YOUR_ACCESS_KEY_ID
aws configure set aws_secret_access_key YOUR_SECRET_ACCESS_KEY
```

Now you are ready to deploy using the CDK. Run command in each directory:

```bash
cd srs-cdk-ec2-single-origin
cdk deploy
```

Alternatively, you can use an environment variable to change the target region for CDK deployment.

```bash
env AWS_REGION=us-east-2 cdk deploy
```

If you need to directly specify the account and region for the CDK:

```bash
env CDK_DEPLOY_ACCOUNT=YOUR_AWS_ACCOUNT CDK_DEPLOY_REGION=us-east-2 cdk deploy
```

For other use scenarios, please follow the instructions provided in each example.

* [srs-cdk-ec2-single-origin](./srs-cdk-ec2-single-origin/README.md): A single SRS origin server runs on an EC2 instance.

For each example, the `cdk.json` file tells the CDK Toolkit how to execute your app. Below are some useful commands.

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
