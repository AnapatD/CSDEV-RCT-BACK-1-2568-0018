import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { S3Client, PutObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3';
import { Scalar } from '@scalar/hono-api-reference';

import { auth } from './Middleware/auth.js'

const app = new Hono()
const prisma = new PrismaClient()

// JWT
const SECRET_KEY = process.env.SECRET_KEY!;
const TOKEN_EXPIRE = 60 * 20; // 20 mins

// S3 Bucket
const BUCKET_NAME = process.env.BUCKET_NAME!;
const BUCKET_REGION = process.env.BUCKET_REGION!;
const ACCESS_KEY = process.env.ACCESS_KEY!;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!;

const s3 = new S3Client({
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  region: BUCKET_REGION
});

app.post('/api/auth/register', async (c) => {
  const { name, pass } = await c.req.json();
  var userExist = await prisma.user.findUnique({ where: { name: name } });
  if (userExist) {
    c.status(400);
    return c.text("User already exist.");
  }
  const hash = await argon2.hash(pass);
  const user = await prisma.user.create({ data: { name: name, passwordHash: hash } });
  c.status(200);
  return c.json(user);
})

app.post('/api/auth/login', async (c) => {
  const { name, pass } = await c.req.json();
  const user = await prisma.user.findUnique({ where: { name: name } });
  
  if (!user) {
    c.status(400);
    return c.text("User not found");
  }
  
  try {
    const verify = await argon2.verify(user.passwordHash, pass);
    if (!verify) {
      c.status(401);
      return c.text("Password incorrect.");
    }
  } catch (err) {
    console.log(err);
    c.status(401);
    return c.text("Wrong password.");
  }
  const payload = { id: user.id, name };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: TOKEN_EXPIRE });
  console.log("Logged in")
  return c.json({ name: name, token: token, expiration: Date.now() });
})

app.get('/api/@me', auth, async (c) => {
  const name = c.get('user').name;
  const list = await prisma.user.findUnique({
    where: { name },
    select: {
      name: true,
      files: {
        select: {
          fileName: true,
          fileSize: true,
          uploadDate: true
        }
      }
    },
  })
  return c.json(list);
})

app.post('/api/fs', auth, async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file !== "object" || file.type !== "image/png") {
    c.status(400);
    return c.text("Please send a valid file");
  }
  console.log(file);
  const fname = `${Date.now()}_${file.name}`;
  if (!file) {
    c.status(400);
    return c.text("No file uploaded.");
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const params = {
    Bucket: BUCKET_NAME,
    Key: fname,
    Body: buffer,
    ContentType: file.type,
    ACL: "public-read" as ObjectCannedACL
  }
  const command = new PutObjectCommand(params);

  await s3.send(command);

  const link = `https://${BUCKET_NAME}.s3.${BUCKET_REGION}.amazonaws.com/${fname}`
  const uid = await c.get('user').id;
  await prisma.file.create({
    data: {
      fileName: fname,
      s3URL: link,
      fileSize: file.size,
      userID: uid
    }
  })
  c.status(200);
  return c.text("Upload Success.");
})

app.get('/api/fs/:path', auth, async (c) => {
  const path = c.req.param('path');
  const file = await prisma.file.findUnique({
    where: {
      fileName: path
    },
    include: {
      user: true
    }
  })
  const fileOwner = file?.user.name;
  if (!file || c.get('user').name !== fileOwner) {
    c.status(404);
    return c.text("File not found");
  }

  const response = await fetch(file.s3URL);
  if (!response) {
    c.status(500);
    return c.text("Server Error.");
  }
  return new Response(response.body)
})

app.get('/showdb', async (c) => {
  const user = await prisma.user.findMany();
  const file = await prisma.file.findMany();
  return c.json({ user, file });
})

app.get('/openapi.yaml', serveStatic({ path: './openapi.yaml' }));

app.get('/docs', Scalar({
  theme: 'kepler',
  url: '/openapi.yaml'
}));

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
