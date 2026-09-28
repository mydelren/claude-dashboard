/**
 * Token speed widget - displays output token generation speed
 * Both spans it can report are derived from the transcript; see tokenSpeedMode.
 * @handbook 3.3-widget-data-sources
 * @tested scripts/__tests__/widgets.test.ts
 */

import type { Widget } from './base.js';
import type { WidgetContext, TokenSpeedData, ParsedTranscript } from '../types.js';
import { colorize, getTheme } from '../utils/colors.js';
import { ICON } from '../utils/emoji.js';
import { getTranscript } from '../utils/transcript-parser.js';

export const tokenSpeedWidget: Widget<TokenSpeedData> = {
  id: 'tokenSpeed',
  name: 'Token Speed',

  async getData(ctx: WidgetContext): Promise<TokenSpeedData | null> {
    // Until Claude Code 2.1.132, stdin's context_window held session totals and the
    // ratio below was a session average. 2.1.132 redefined those fields as
    // current-context values, so the numerator became the newest response's output
    // while the denominator stayed the session's cumulative API duration — the
    // reading then sank as the session grew. Both halves come from the transcript
    // now, which also lets the widget scope itself to a single response.
    const transcript = await getTranscript(ctx);
    if (!transcript) return null;

    const tokensPerSecond =
      ctx.config.tokenSpeedMode === 'last'
        ? lastResponseRate(transcript)
        : sessionRate(transcript, ctx.stdin.cost?.total_api_duration_ms);

    if (tokensPerSecond === null) return null;

    return { tokensPerSecond };
  },

  render(data: TokenSpeedData, _ctx: WidgetContext): string {
    return colorize(`${ICON.zap} ${Math.round(data.tokensPerSecond)} tok/s`, getTheme().accent);
  },
};

/**
 * Throughput of the newest response alone: its output tokens over its own wall-clock
 * span. Null until a response has both a count and a measurable span.
 */
function lastResponseRate(transcript: ParsedTranscript): number | null {
  const { lastRequestOutput, lastRequestDurationMs } = transcript;
  if (!lastRequestOutput || lastRequestOutput <= 0) return null;
  if (!lastRequestDurationMs || lastRequestDurationMs <= 0) return null;

  const rate = lastRequestOutput / (lastRequestDurationMs / 1000);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Session throughput: every response's output tokens over the session's cumulative
 * API duration. A long session therefore moves slowly — it answers "how fast has
 * this session been", not "how fast was that last response".
 */
function sessionRate(transcript: ParsedTranscript, apiDurationMs?: number): number | null {
  if (!apiDurationMs || apiDurationMs <= 0) return null;

  const { totalOutputTokens } = transcript;
  if (!totalOutputTokens || totalOutputTokens <= 0) return null;

  const rate = totalOutputTokens / (apiDurationMs / 1000);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
