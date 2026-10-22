# APIMart 模型能力排查

> 生成时间：2026-10-21T14:44:25.134Z  
> 数据源：`GET /v1/models?expand=parameters&category=...`（平台权威分类 + 能力标签 + 参数 Schema）

**模型总数 318**；按节点类型筛出：图片 **53**、视频 **57**、文本 **181**、音频 **9**。

对比：旧的前缀猜法得到 图片 66 / 视频 64 / 文本 173 / 音频 12，其中图片与视频各混入了不能生成对应媒体的模型；下面全部以平台 category 为准。

## 图片（image_generation）

| 模型 | 能力标签 | 参考图/首帧 |
| --- | --- | :-: |
| `seedream-5-0-flash` | t2i / text / i2i | ✅ |
| `seedream-5-0-lite` | t2i / text | — |
| `seedream-4-5` | t2i / text | — |
| `flux-2-flex` | t2i / text / i2i | ✅ |
| `gpt-image-1.5` | t2i / text | — |
| `seedream-4-0` | t2i / text | — |
| `dall-e-3` | — | — |
| `flux-2-max` | t2i / text / i2i | ✅ |
| `flux-2-pro` | t2i / text / i2i | ✅ |
| `flux-3-image` | t2i / text / i2i | ✅ |
| `flux-3-image-klein` | t2i / text / i2i | ✅ |
| `flux-kontext-max` | t2i / text / i2i | ✅ |
| `flux-kontext-pro` | t2i / text / i2i | ✅ |
| `gemini-2.5-flash-image-preview` | t2i / text | — |
| `gemini-2.5-flash-image-preview-official` | t2i / text / i2i | ✅ |
| `gemini-3-pro-image-preview` | t2i / text | — |
| `gemini-3-pro-image-preview-official` | t2i / text / i2i | ✅ |
| `gemini-3.1-flash-image-preview` | t2i / text | — |
| `gemini-3.1-flash-image-preview-official` | t2i / text / i2i | ✅ |
| `gemini-3.1-flash-lite-image` | t2i / text / i2i | ✅ |
| `gemini-3.1-flash-lite-image-ext` | t2i / text | — |
| `gemini-nano-banana-2.1` | t2i / text / i2i | ✅ |
| `gemini-nano-banana-2.1-ext` | t2i / text | — |
| `gpt-image-1` | — | — |
| `gpt-image-1-official` | t2i / text | — |
| `gpt-image-1.5-official` | t2i / text | — |
| `gpt-image-2` | t2i / text | — |
| `gpt-image-2-official` | t2i / text | — |
| `gpt-image-2.5-ext` | t2i / text | — |
| `gpt-image-2.5-flare` | t2i / text / i2i | ✅ |
| `gpt-image-2.5-sunburst` | t2i / text / i2i | ✅ |
| `grok-imagine-1.0-apimart` | t2i / text | — |
| `grok-imagine-1.0-edit-apimart` | t2i / text / i2i | ✅ |
| `grok-imagine-1.5-apimart` | t2i / text | — |
| `grok-imagine-1.5-edit-apimart` | t2i / text / i2i | ✅ |
| `grok-imagine-2.0-ext` | t2i / text | — |
| `grok-imagine-image` | t2i / text | — |
| `grok-imagine-image-2.0` | t2i / text | — |
| `grok-imagine-image-quality` | t2i / text / i2i | ✅ |
| `hy-image-v3.5-preview` | t2i / text / i2i | ✅ |
| `imagen-4.0-apimart` | t2i / text | — |
| `ltx-2.3-text-image` | t2i / text | — |
| `mai-image-2.6` | t2i / text / i2i | ✅ |
| `mai-image-2.6-flash` | t2i / text / i2i | ✅ |
| `midjourney` | t2i / text / i2i | ✅ |
| `qwen-image-2.0` | t2i / text / i2i | ✅ |
| `qwen-image-2.0-pro` | t2i / text / i2i | ✅ |
| `qwen-image-3.0` | t2i / text / i2i | ✅ |
| `qwen-image-3.0-pro` | t2i / text / i2i | ✅ |
| `seedream-5-0-pro` | t2i / text / i2i | ✅ |
| `wan2.7-image` | t2i / text / i2i | ✅ |
| `wan2.7-image-pro` | t2i / text / i2i | ✅ |
| `z-image-turbo` | t2i / text | — |

## 视频（video_generation）

| 模型 | 能力标签 | 参考图/首帧 |
| --- | --- | :-: |
| `seedance-2.0-mini` | i2v / t2v / text / v2v | ✅ |
| `seedance-2.0` | t2v / text / i2v / v2v | ✅ |
| `veo3.1-fast` | — | — |
| `seedance-1-0-pro-fast` | t2v / text / i2v / v2v | ✅ |
| `kling-3.0-turbo` | text | — |
| `flux-3-video` | i2v / t2v / text | ✅ |
| `gemini-omni-1.1-flash` | t2v / text | — |
| `gemini-omni-flash-preview` | t2v / text / i2v / v2v | ✅ |
| `grok-imagine-1.0-video-apimart` | t2v / text | — |
| `grok-imagine-1.5-video-apimart` | t2v / text | — |
| `grok-imagine-video` | i2v / t2v / text | ✅ |
| `grok-imagine-video-1.5` | i2v / t2v / text | ✅ |
| `happyhorse-1.0` | t2v / text / i2v / v2v | ✅ |
| `happyhorse-1.1` | i2v / t2v / text | ✅ |
| `kling-v2-6` | t2v / text | — |
| `kling-v2-6-motion-control` | t2v / i2v / v2v / text | ✅ |
| `kling-v3` | t2v / text | — |
| `kling-v3-motion-control` | t2v / text / i2v / v2v | ✅ |
| `kling-v3-omni` | t2v / text | — |
| `kling-video-o1` | t2v / text | — |
| `ltx-2.3-image-video` | t2v / text | — |
| `ltx-2.3-text-video` | t2v / text | — |
| `MiniMax-H3` | i2v / t2v / text | ✅ |
| `MiniMax-H3-Context-IR` | t2v / text | — |
| `MiniMax-H3-Max` | i2v / t2v / text | ✅ |
| `MiniMax-H3-Regeneration` | t2v / text | — |
| `MiniMax-Hailuo-02` | t2v / text | — |
| `MiniMax-Hailuo-2.3` | t2v / text | — |
| `MiniMax-Hailuo-2.3-Fast` | i2v / t2v / text | ✅ |
| `Omni-Flash-Ext` | t2v / text / i2v | ✅ |
| `pixverse-v6` | text | — |
| `seedance-1-0-pro-quality` | t2v / text | — |
| `seedance-1-5-pro` | t2v / text | — |
| `seedance-2.0-face` | t2v / text / i2v / v2v | ✅ |
| `seedance-2.0-fast` | t2v / text / i2v / v2v | ✅ |
| `seedance-2.0-fast-face` | v2v / t2v / text / i2v | ✅ |
| `seedance-2.5` | t2v / text / i2v / v2v | ✅ |
| `skyreels-v4-fast` | t2v / text | — |
| `skyreels-v4-std` | t2v / text | — |
| `veo3.1-fast-official` | t2v / text | — |
| `veo3.1-lite` | t2i / text / i2i | — |
| `veo3.1-quality` | — | — |
| `veo3.1-quality-official` | t2v / text | — |
| `viduq3` | t2v / text / i2v | ✅ |
| `viduq3-mix` | t2v / text / i2v | ✅ |
| `viduq3-pro` | i2v / t2v / text | ✅ |
| `viduq3-turbo` | t2v / text / i2v | ✅ |
| `viduq4-preview` | i2v | ✅ |
| `wan2.5-preview` | t2v / text / i2v | ✅ |
| `wan2.6` | t2v / text / i2v | ✅ |
| `wan2.6-i2v` | i2v / t2v / text | ✅ |
| `wan2.6-i2v-flash` | t2v / text / i2v | ✅ |
| `wan2.7` | t2v / text / i2v | ✅ |
| `wan2.7-r2v` | t2v / text / i2v / v2v | ✅ |
| `wan2.7-videoedit` | i2v / t2v / text | ✅ |
| `wan3.0-video` | t2v / text / i2v / v2v | ✅ |
| `wan3.0-video-prime` | i2v / t2v / text | ✅ |

## 文本（chat）

| 模型 | 能力标签 | 参考图/首帧 |
| --- | --- | :-: |
| `gemini-2.5-flash-lite` | — | — |
| `gpt-4o-mini` | — | — |
| `deepseek-v4-flash` | text | — |
| `qwen-turbo` | text | — |
| `gemini-2.5-flash` | — | — |
| `chatgpt-4o-latest` | text / vision | — |
| `claude-fable-5` | text | — |
| `claude-fable-5.1` | text | — |
| `claude-haiku-4-5-20251001` | — | — |
| `claude-haiku-4-5-20251001-thinking` | — | — |
| `claude-haiku-5-5` | text | — |
| `claude-opus-4-5-20251101` | — | — |
| `claude-opus-4-5-20251101-thinking` | — | — |
| `claude-opus-4-6` | — | — |
| `claude-opus-4-6-thinking` | — | — |
| `claude-opus-4-7` | — | — |
| `claude-opus-4-8` | text | — |
| `claude-opus-5` | text | — |
| `claude-opus-5-5` | text | — |
| `claude-sonnet-4-5-20250929` | — | — |
| `claude-sonnet-4-5-20250929-thinking` | — | — |
| `claude-sonnet-4-6` | — | — |
| `claude-sonnet-4-6-thinking` | — | — |
| `claude-sonnet-5` | text | — |
| `claude-sonnet-5-5` | text | — |
| `deepseek-r1` | text | — |
| `deepseek-r1-0528` | text | — |
| `deepseek-r1-250528` | text | — |
| `deepseek-v3-0324` | text | — |
| `deepseek-v3.1` | text | — |
| `deepseek-v3.2` | text | — |
| `deepseek-v3.2-exp` | text | — |
| `deepseek-v4-pro` | text | — |
| `deepseek-v4.1-flash` | text | — |
| `gemini-2.5-flash-nothinking` | — | — |
| `gemini-2.5-flash-thinking` | — | — |
| `gemini-2.5-pro` | — | — |
| `gemini-2.5-pro-nothinking` | — | — |
| `gemini-2.5-pro-thinking` | — | — |
| `gemini-3-flash-preview` | — | — |
| `gemini-3-flash-preview-nothinking` | — | — |
| `gemini-3-flash-preview-thinking` | text / vision | — |
| `gemini-3-pro-preview` | — | — |
| `gemini-3-pro-preview-thinking` | — | — |
| `gemini-3.1-flash-lite-preview` | text / vision | — |
| `gemini-3.1-pro-preview` | — | — |
| `gemini-3.1-pro-preview-thinking` | text / vision | — |
| `gemini-3.5-flash` | text | — |
| `gemini-3.5-flash-lite` | text | — |
| `gemini-3.6-flash` | text | — |
| `gemini-3.7-flash` | text | — |
| `gemini-3.8-flash` | text | — |
| `gemini-4-argon` | text | — |
| `glm-4.6` | text | — |
| `glm-4.7` | text | — |
| `glm-5` | text | — |
| `glm-5.1` | text | — |
| `glm-5.2` | text | — |
| `glm-5.3` | text | — |
| `glm-5.3-flash` | text | — |
| `gpt-3.5-turbo` | — | — |
| `gpt-3.5-turbo-0125` | — | — |
| `gpt-3.5-turbo-0613` | text | — |
| `gpt-3.5-turbo-1106` | — | — |
| `gpt-3.5-turbo-16k` | text | — |
| `gpt-3.5-turbo-16k-0613` | text | — |
| `gpt-3.5-turbo-instruct` | — | — |
| `gpt-4-0125-preview` | text | — |
| `gpt-4-1106-preview` | text | — |
| `gpt-4-32k` | text | — |
| `gpt-4-32k-0613` | text | — |
| `gpt-4-vision-preview` | text / vision | — |
| `gpt-4.1` | — | — |
| `gpt-4.1-2025-04-14` | — | — |
| `gpt-4.1-mini` | — | — |
| `gpt-4.1-mini-2025-04-14` | — | — |
| `gpt-4.1-nano` | — | — |
| `gpt-4.1-nano-2025-04-14` | — | — |
| `gpt-4.5-preview` | text / vision | — |
| `gpt-4.5-preview-2025-02-27` | text / vision | — |
| `gpt-4o` | — | — |
| `gpt-4o-2024-05-13` | — | — |
| `gpt-4o-2024-11-20` | — | — |
| `gpt-4o-mini-realtime-preview` | text / vision | — |
| `gpt-4o-mini-realtime-preview-2024-12-17` | text / vision | — |
| `gpt-4o-realtime-preview` | text / vision | — |
| `gpt-4o-realtime-preview-2024-10-01` | text / vision | — |
| `gpt-4o-realtime-preview-2024-12-17` | text / vision | — |
| `gpt-5` | — | — |
| `gpt-5-2025-08-07` | text / vision | — |
| `gpt-5-chat-latest` | — | — |
| `gpt-5-codex` | — | — |
| `gpt-5-mini` | — | — |
| `gpt-5-mini-2025-08-07` | text / vision | — |
| `gpt-5-nano` | — | — |
| `gpt-5-nano-2025-08-07` | text / vision | — |
| `gpt-5-pro` | — | — |
| `gpt-5-pro-2025-10-06` | text / vision | — |
| `gpt-5-search-api` | text / vision | — |
| `gpt-5-search-api-2025-10-14` | text / vision | — |
| `gpt-5.1` | — | — |
| `gpt-5.1-2025-11-13` | — | — |
| `gpt-5.1-chat-latest` | text / vision | — |
| `gpt-5.1-codex` | text | — |
| `gpt-5.1-codex-max` | text | — |
| `gpt-5.1-codex-mini` | text | — |
| `gpt-5.2` | text | — |
| `gpt-5.2-chat-latest` | text / vision | — |
| `gpt-5.2-codex` | text | — |
| `gpt-5.2-pro` | — | — |
| `gpt-5.3-codex` | text | — |
| `gpt-5.4` | text | — |
| `gpt-5.4-mini` | text | — |
| `gpt-5.4-nano` | text | — |
| `gpt-5.4-pro` | text | — |
| `gpt-5.5` | text | — |
| `gpt-5.6-luna` | text | — |
| `gpt-5.6-sol` | text | — |
| `gpt-5.6-terra` | text | — |
| `gpt-6-astra` | text | — |
| `gpt-6-luna` | text | — |
| `gpt-6-sol` | text | — |
| `gpt-6.1-sol` | text | — |
| `grok-4.20-0309-non-reasoning` | text | — |
| `grok-4.20-0309-reasoning` | text | — |
| `grok-4.20-multi-agent-0309` | text | — |
| `grok-4.3` | text | — |
| `grok-4.5` | text | — |
| `grok-4.6` | — | — |
| `grok-4.7` | text | — |
| `grok-build-0.1` | text | — |
| `kimi-k2-instruct` | text | — |
| `kimi-k2-thinking` | text | — |
| `kimi-k2.5` | text | — |
| `kimi-k2.6` | text | — |
| `kimi-k2.7-code` | text | — |
| `kimi-k2.7-code-highspeed` | text | — |
| `kimi-k3` | text | — |
| `mimo-v2.5-pro` | text | — |
| `minimax-m2.1` | text | — |
| `minimax-m2.5` | text | — |
| `minimax-m2.7` | text | — |
| `minimax-m3` | text | — |
| `o1` | — | — |
| `o1-2024-12-17` | text / vision | — |
| `o1-mini` | — | — |
| `o1-mini-2024-09-12` | text / vision | — |
| `o1-preview` | text / vision | — |
| `o1-preview-2024-09-12` | text / vision | — |
| `o1-pro` | — | — |
| `o1-pro-2025-03-19` | text / vision | — |
| `o3` | — | — |
| `o3-2025-04-16` | — | — |
| `o3-deep-research` | text / vision | — |
| `o3-deep-research-2025-06-26` | text / vision | — |
| `o3-mini` | — | — |
| `o3-mini-2025-01-31` | text / vision | — |
| `o3-mini-2025-01-31-high` | text / vision | — |
| `o3-mini-2025-01-31-low` | text / vision | — |
| `o3-mini-2025-01-31-medium` | text / vision | — |
| `o3-mini-high` | text / vision | — |
| `o3-mini-low` | text / vision | — |
| `o3-mini-medium` | text / vision | — |
| `o3-pro` | — | — |
| `o3-pro-2025-06-10` | text / vision | — |
| `o4-mini` | — | — |
| `o4-mini-2025-04-16` | text / vision | — |
| `o4-mini-deep-research` | text / vision | — |
| `o4-mini-deep-research-2025-06-26` | text / vision | — |
| `qwen3.6-flash` | text | — |
| `qwen3.6-max` | text | — |
| `qwen3.6-plus` | text | — |
| `qwen3.7-flash` | text | — |
| `qwen3.7-max` | text | — |
| `qwen3.7-plus` | text | — |
| `qwen3.8-2.4t-a95b` | text | — |
| `qwen3.8-27b` | text | — |
| `qwen3.8-flash` | text | — |
| `qwen3.8-max` | text | — |
| `qwen3.8-max-0902` | text | — |
| `step-3.7-flash` | text | — |

## 音频（audio）

| 模型 | 能力标签 | 参考图/首帧 |
| --- | --- | :-: |
| `tts-1` | — | — |
| `gpt-4o-mini-tts` | — | — |
| `flowmusic` | t2a / text / a2a | — |
| `gpt-audio-mini` | — | — |
| `gpt-audio-mini-2025-10-06` | — | — |
| `suno` | t2a / text / a2a | — |
| `tts-1-1106` | — | — |
| `tts-1-hd` | — | — |
| `tts-1-hd-1106` | — | — |

## 排除的模型

| 模型 | 平台分类 | 原因 |
| --- | --- | --- |
| `babbage-002` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `davinci-002` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `deepseek-ocr` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `gpt-4o-mini-transcribe` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `gpt-4o-transcribe` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `omni-moderation-latest` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `text-embedding-3-large` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `text-embedding-3-small` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `text-embedding-ada-002` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `text-moderation-latest` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `text-moderation-stable` | chat | 非对话模型（补全/嵌入/转写/多模态音频等） |
| `gpt-4o-audio-preview` | audio | 非语音合成模型（转写类） |
| `gpt-4o-audio-preview-2024-10-01` | audio | 非语音合成模型（转写类） |
| `whisper-1` | audio | 非语音合成模型（转写类） |

## 未归类但按 chat 家族兜底

- `deepseek-v3.1`
- `qwen3.6-max`

## 仍未归类（category=unknown）

- `text-ada-001`
- `text-babbage-001`
- `text-curie-001`
- `text-davinci-edit-001`