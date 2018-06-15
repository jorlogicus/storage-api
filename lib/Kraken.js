'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')
var s3

function makeKey (length) {
  // generate random string
  let text = ''
  let possible = 'abcdefghijklmnopqrstuvwxyz'

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

let runMethod = (method, params) => {
  // work with Promises
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
  return new Promise((resolve, reject) => {
    s3[method](params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        // success
        resolve(data)
      }
    })
  })
}

let createBucket = (locationConstraint, bucket, tries = 0) => {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createBucket-property
  if (!bucket) {
    // random bucket name
    bucket = 'ecom-' + makeKey(8)
  }
  let params = {
    Bucket: bucket,
    ACL: 'public-read',
    CreateBucketConfiguration: {
      LocationConstraint: locationConstraint
    }
  }
  /* debug
  logger.log(s3)
  logger.log(params)
  */

  return new Promise((resolve, reject) => {
    let successCallback = () => {
      // returns created bucket name
      resolve({ bucket })
    }

    let failureCallback = (err) => {
      if (tries < 3) {
        // retry
        tries++
        setTimeout(() => {
          // try with new random bucket
          createBucket(locationConstraint, null, tries).then(resolve).catch(reject)
        }, 1500)
      } else {
        reject(err)
      }
    }

    runMethod('createBucket', params).then(successCallback).catch(failureCallback)
  })
}

let listObjects = (bucket, prefix, continuationToken) => {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property
  let params = {
    Bucket: bucket,
    // try list all keys, use API limit
    MaxKeys: 1000
  }
  if (prefix) {
    // keys that begin with the specified prefix
    // good to list 'directories' contents
    params.Prefix = prefix
  }
  if (continuationToken) {
    // list is being continued on this bucket with a token
    params.ContinuationToken = continuationToken
  }

  return new Promise((resolve, reject) => {
    // run method and pass to callback
    runMethod('listObjectsV2', params).then(resolve).catch(reject)
  })
}

let getBucketSize = (bucket) => {
  return new Promise((resolve, reject) => {
    // list all bucket objects
    let objects = []

    let list = (continuationToken) => {
      let successCallback = (data) => {
        // store objects
        data.Contents.forEach((object) => {
          objects.push(object)
        })

        if (data.KeyCount === data.MaxKeys && data.NextContinuationToken) {
          // next page
          list(data.NextContinuationToken)
        } else {
          // count total bytes
          let size = 0
          for (let i = 0; i < objects.length; i++) {
            size += objects[i].Size
          }
          // pass size to callbak
          resolve({ size })
        }
      }

      listObjects(bucket, null, continuationToken).then(successCallback).catch(reject)
    }
    // start listing
    list()
  })
}

module.exports = (awsEndpoint, locationConstraint, { accessKeyId, secretAccessKey }) => {
  // set S3 endpoint
  const spacesEndpoint = new AWS.Endpoint(awsEndpoint)
  s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    credentials: new AWS.Credentials({
      accessKeyId,
      secretAccessKey
    })
  })
  // log S3 config options
  let debug = 'Seting up S3 client endpoint:' +
    '\n' + awsEndpoint +
    '\nRegion ' + locationConstraint
  logger.log(debug)

  return {
    s3,
    createBucket,
    listObjects,
    getBucketSize,
    runMethod
  }
}