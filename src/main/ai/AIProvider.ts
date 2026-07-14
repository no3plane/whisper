import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import type { AISettings } from '../../shared/types';
import { logger, redactSettings } from '../logging/logger';
import type { AssembledContext } from './ContextAssembler';

export interface StreamGenerateHandlers {
  onChunk: (chunk: string) => void;
}

export interface GenerateOptions {
  purpose?: string;
}

export class AIProvider {
  async generate(settings: AISettings, input: AssembledContext, options?: GenerateOptions) {
    const startedAt = Date.now();
    logger.info('ai.generate.start', {
      purpose: options?.purpose,
      settings: redactSettings(settings),
      systemLength: input.system.length,
      messageCount: input.messages.length,
      messageLengths: input.messages.map((message) => message.content.length),
    });

    try {
      const openai = createOpenAI({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey,
      });

      const result = await generateText({
        model: openai(settings.model),
        system: input.system,
        messages: input.messages,
      });

      const output = {
        text: result.text,
        usage: result.usage.totalTokens ?? null,
      };

      logger.info('ai.generate.done', {
        purpose: options?.purpose,
        model: settings.model,
        durationMs: Date.now() - startedAt,
        tokenUsage: output.usage,
        textLength: output.text.length,
      });

      return output;
    } catch (error) {
      logger.error('ai.generate.error', {
        purpose: options?.purpose,
        model: settings.model,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async streamGenerate(
    settings: AISettings,
    input: AssembledContext,
    handlers: StreamGenerateHandlers,
  ) {
    const startedAt = Date.now();
    logger.info('ai.stream.start', {
      settings: redactSettings(settings),
      systemLength: input.system.length,
      messageCount: input.messages.length,
      messageLengths: input.messages.map((message) => message.content.length),
    });

    try {
      const openai = createOpenAI({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey,
      });

      const result = streamText({
        model: openai(settings.model),
        system: input.system,
        messages: input.messages,
      });

      let text = '';
      for await (const chunk of result.textStream) {
        text += chunk;
        handlers.onChunk(chunk);
      }

      const usage = await result.usage;
      const output = {
        text,
        usage: usage.totalTokens ?? null,
      };

      logger.info('ai.stream.done', {
        model: settings.model,
        durationMs: Date.now() - startedAt,
        tokenUsage: output.usage,
        textLength: output.text.length,
      });

      return output;
    } catch (error) {
      logger.error('ai.stream.error', {
        model: settings.model,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async testConnection(settings: AISettings) {
    const result = await this.generate(
      settings,
      {
        system: '你只需要回答 OK。',
        messages: [{ role: 'user', content: '请回答 OK。' }],
        coveredPassageIds: [],
      },
      { purpose: 'testConnection' },
    );

    return {
      ok: result.text.trim().length > 0,
      message: '模型连接成功。',
    };
  }
}
