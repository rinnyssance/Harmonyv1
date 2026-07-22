import type { Request, Response } from "express";

export default function handler(_request: Request, response: Response) {
  response.status(200).json({ status: "ok", service: "harmony" });
}
