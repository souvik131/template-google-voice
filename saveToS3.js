const config = require("./serverConfig");
const AWS = require("aws-sdk");
module.exports.upload = function(name, mimeType, content) {
  return new Promise((resolve, reject) => {
    let s3bucket = new AWS.S3({
      accessKeyId: config.s3.iamUserKey,
      secretAccessKey: config.s3.iamUserSecret,
      Bucket: config.s3.bucketName
    });
    var params = {
      Bucket: config.s3.bucketName,
      Key: name,
      Body: Buffer.from(content),
      ACL: "public-read",
      ContentType: mimeType,
      CacheControl: "no-cache"
    };
    s3bucket.upload(params, function(err, data) {
      if (err) {
        console.error(err);
        return reject(err);
        // return resolve(data);
      }
      // let data={}
      return resolve(data);
    });
  });
};
