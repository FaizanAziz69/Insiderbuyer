import { Controller, Get, Param } from '@nestjs/common';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  /** Community discussion posts mentioning a ticker (Conversations tab). */
  @Get('discussions/:ticker')
  discussions(@Param('ticker') ticker: string) {
    return this.social.getDiscussions(ticker);
  }
}
