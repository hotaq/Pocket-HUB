import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './agent/agent.module';
import { ResourceModule } from './resource/resource.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    AuthModule,
    AgentModule,
    ResourceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
