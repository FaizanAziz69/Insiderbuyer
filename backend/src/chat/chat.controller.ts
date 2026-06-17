import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { ChatService, ChatRequest } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  async send(@Body() body: ChatRequest) {
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BadRequestException('messages is required and must be a non-empty array');
    }
    for (const m of body.messages) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
        throw new BadRequestException(
          'Each message must be { role: "user" | "assistant", content: string }',
        );
      }
      if (m.content.length > 4000) {
        throw new BadRequestException('Message too long (max 4000 characters).');
      }
    }
    if (body.messages.length > 30) {
      throw new BadRequestException('Conversation too long (max 30 messages).');
    }
    return this.chat.chat(body);
  }
}
