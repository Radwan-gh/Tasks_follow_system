import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { mountMcp } from "./mcp/mount";
import { buildZodComponents } from "./swagger/schema-registry";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // Railway terminates TLS at its proxy; trust its X-Forwarded-For so the MCP
  // OAuth endpoints rate-limit per client rather than per proxy.
  app.set("trust proxy", 1);
  mountMcp(app);

  const config = new DocumentBuilder()
    .setTitle("Kanban API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Nest's introspection only sees the `@Api*` decorators; the actual
  // request/response shapes come from the Zod schemas in `@app/types`,
  // generated into components here and referenced via `zodRef`/`zodArrayRef`.
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...buildZodComponents() },
  };
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
