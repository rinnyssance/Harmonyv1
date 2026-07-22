import type { Request, Response } from "express";

export default function handler(_request: Request, response: Response) {
  const redisConfigured = Boolean(process.env.REDIS_URL);
  const ready = !process.env.VERCEL || redisConfigured;
  response.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "configuration_required",
    service: "harmony",
    storage: redisConfigured ? "redis" : "memory",
  });
}
