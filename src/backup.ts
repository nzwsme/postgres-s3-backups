import { exec } from "child_process";
import {
  DeleteObjectsCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createReadStream, unlink } from "fs";
import { env } from "./env";
import { Upload } from "@aws-sdk/lib-storage";

const uploadToS3 = async ({ name, path }: { name: string; path: string }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
  };

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
    clientOptions["endpoint"] = env.AWS_S3_ENDPOINT;
  }

  const client = new S3Client(clientOptions);

  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: name,
      Body: createReadStream(path),
    }
  }).done();

  console.log("Backup uploaded to S3...");
};

const removeOutdatedBackups = async (days = 31) => {
  console.log("Removing outdated backups...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
  };

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
    clientOptions["endpoint"] = env.AWS_S3_ENDPOINT;
  }

  const client = new S3Client(clientOptions);

  const listObjectsCommand = new ListObjectsCommand({
    Bucket: bucket,
  });

  const listObjectsResponse = await client.send(listObjectsCommand);

  const objects = listObjectsResponse.Contents;

  if (!objects) {
    console.log("No objects found in bucket");
    return;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const outdatedObjects = objects.filter((object) => {
    if (!object.LastModified) {
      console.warn(`Object ${object.Key} has no LastModified date`);
      return false;
    }

    const objectDate = new Date(object.LastModified);
    return objectDate < cutoff;
  });

  if (outdatedObjects.length === 0) {
    console.log("No outdated objects found");
    return;
  }

  console.log(`Removing ${outdatedObjects.length} outdated objects...`);

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: outdatedObjects.map((object) => ({
          Key: object.Key,
        })),
      },
    })
  );

  console.log("Outdated backups removed...");
};

const dumpToFile = async (path: string, url: string) => {
  console.log("Dumping DB to file...");

  await new Promise((resolve, reject) => {
    exec(`pg_dump ${url} -Fc | gzip > ${path}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: JSON.stringify(error), stderr });
        return;
      }

      resolve(undefined);
    });
  });

  console.log("DB dumped to file...");
};

const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: JSON.stringify(err) });
      return;
    });
    resolve(undefined);
  });
};

export const backup = async () => {
  console.log("Initiating DB backup...");

  let date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, "-");

  const databases = env.BACKUP_DATABASE_NAMES.split(",");
  for (const database of databases) {
    const databaseUrl = `${env.BACKUP_DATABASE_URL}/${database}`;
    console.log(`Backing up database: ${database}`);
    const filename = `backup-${timestamp}-${database}.tar.gz`;
    const filepath = `/tmp/${filename}`;

    await dumpToFile(filepath, databaseUrl);
    await uploadToS3({ name: filename, path: filepath });
    await deleteFile(filepath);
  }

  await removeOutdatedBackups();

  console.log("DB backup complete...");
};
