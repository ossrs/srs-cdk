#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SrsCdkEc2SingleOriginStack } from '../lib/srs-cdk-ec2-single-origin-stack';

const app = new cdk.App();

const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const region  = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION;
console.log(`Deploying to account: ${account}, region: ${region}`);
if (!account || !region) {
  console.error('❌ Error: CDK_DEFAULT_ACCOUNT or CDK_DEFAULT_REGION is not set.');
  process.exit(1);
}

new SrsCdkEc2SingleOriginStack(app, 'SrsCdkEc2SingleOriginStack', {
  env: { account, region },
});
