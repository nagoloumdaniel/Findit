import { parseDatabaseEnv } from "@findit/config";
import { createPrismaClient, type PrismaClient } from "@findit/database";
import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";

export const PRISMA_CLIENT = Symbol("PRISMA_CLIENT");

/*
 * Ferme le pool de connexions quand Nest s'arrête, afin qu'un redémarrage ne
 * laisse pas de connexion ouverte côté PostgreSQL.
 */
@Injectable()
class PrismaLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly client: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: (): PrismaClient =>
        createPrismaClient(parseDatabaseEnv(process.env).DATABASE_URL),
    },
    PrismaLifecycleService,
  ],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
