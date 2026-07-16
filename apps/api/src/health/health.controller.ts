import { Controller, Get } from "@nestjs/common";

type HealthResponse = Readonly<{
  status: "ok";
  service: "api";
}>;

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: "ok", service: "api" };
  }
}
