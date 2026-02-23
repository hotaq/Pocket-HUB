import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FriendService } from './friend.service';
import { FriendDomainError } from './friend.errors';

@Controller('api/friends')
@UseGuards(AuthGuard('jwt'))
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  private mapFriendError(error: FriendDomainError): HttpException {
    switch (error.code) {
      case 'INVALID_TARGET':
        return new HttpException(error.message, HttpStatus.BAD_REQUEST);
      case 'DUPLICATE_PENDING_REQUEST':
      case 'ALREADY_FRIENDS':
        return new HttpException(error.message, HttpStatus.CONFLICT);
      case 'REQUEST_NOT_FOUND':
        return new HttpException(error.message, HttpStatus.NOT_FOUND);
      case 'NOT_ALLOWED':
        return new HttpException(error.message, HttpStatus.FORBIDDEN);
      case 'RATE_LIMITED':
        return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      default:
        return new HttpException('Unknown friend error', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('request')
  async requestFriend(
    @Req() req: { user: { userId: string } },
    @Body() body: { targetId: string },
  ) {
    try {
      this.friendService.enforceActionRateLimit(req.user.userId, 'friend-request');
      const relation = await this.friendService.requestFriend(
        req.user.userId,
        body.targetId,
      );
      return { success: true, relation };
    } catch (error) {
      if (error instanceof FriendDomainError) {
        throw this.mapFriendError(error);
      }
      throw error;
    }
  }

  @Post('respond')
  async respondFriendRequest(
    @Req() req: { user: { userId: string } },
    @Body() body: { requesterId: string; action: 'accept' | 'reject' },
  ) {
    try {
      this.friendService.enforceActionRateLimit(req.user.userId, 'friend-respond');
      if (body.action !== 'accept' && body.action !== 'reject') {
        throw new FriendDomainError(
          'INVALID_TARGET',
          'action must be either accept or reject',
        );
      }
      const relation = await this.friendService.respondToRequest(
        req.user.userId,
        body.requesterId,
        body.action,
      );
      return { success: true, relation };
    } catch (error) {
      if (error instanceof FriendDomainError) {
        throw this.mapFriendError(error);
      }
      throw error;
    }
  }

  @Get()
  async listFriends(@Req() req: { user: { userId: string } }) {
    const friends = await this.friendService.listFriends(req.user.userId);
    return { success: true, friends };
  }

  @Delete(':friendId')
  async removeFriend(
    @Req() req: { user: { userId: string } },
    @Param('friendId') friendId: string,
  ) {
    try {
      this.friendService.enforceActionRateLimit(req.user.userId, 'friend-remove');
      const relation = await this.friendService.removeFriend(
        req.user.userId,
        friendId,
      );
      return { success: true, relation };
    } catch (error) {
      if (error instanceof FriendDomainError) {
        throw this.mapFriendError(error);
      }
      throw error;
    }
  }
}
