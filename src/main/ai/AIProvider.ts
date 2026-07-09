import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { AISettings } from '../../shared/types';
import type { AssembledContext } from './ContextAssembler';

export class AIProvider {
  async generate(settings: AISettings, input: AssembledContext) {
    const openai = createOpenAI({
      baseURL: settings.baseURL,
      apiKey: settings.apiKey,
    });

    const result = await generateText({
      model: openai(settings.model),
      system: input.system,
      prompt: input.user,
    });

    return {
      text: result.text,
      usage: result.usage.totalTokens ?? null,
    };
  }

  async testConnection(settings: AISettings) {
    const result = await this.generate(settings, {
      system: '你只需要回答 OK。',
      user: '请回答 OK。',
    });

    return {
      ok: result.text.trim().length > 0,
      message: '模型连接成功。',
    };
  }
}
