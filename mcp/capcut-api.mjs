import { z } from "zod";
import manifest from "./capcut-api-schema.json" with { type: "json" };

const officialBase = "https://capcut-mate.jcaigc.cn";
const apiPrefix = "/openapi/capcut-mate/v1/";
const pointsAddress = "https://jcaigc.cn/openapi/v1/user/points";
const draftId = z.string().regex(/^[A-Za-z0-9_-]{20,32}$/).describe("草稿 ID。");
const httpUrl = z.url({ protocol: /^https?$/ }).describe("HTTP(S) 直链。使用线上草稿 API 时须能从公网访问。");
const draftUrl = httpUrl.refine((value) => {
  const url = new URL(value);
  return url.pathname.endsWith("/get_draft") && draftId.safeParse(url.searchParams.get("draft_id")).success;
}, "请使用 create_draft 或 save_draft 返回的带 draft_id 的草稿链接。")
  .describe("create_draft 或 save_draft 返回的 draft_url。");
const timestamp = z.int().nonnegative();
const timelineFields = {
  start: timestamp.describe("在草稿时间轴上的起点，单位微秒，1 秒 = 1000000。"),
  end: timestamp.describe("在草稿时间轴上的结束位置，单位微秒，须大于 start。"),
};
const resolution = { width: z.int().positive().optional(), height: z.int().positive().optional() };
const volume = z.number().nonnegative().optional().describe("素材音量，1 为原音量。");
const duration = timestamp.optional().describe("素材原始时长，单位微秒。");
const transition = {
  transition: z.string().optional().describe("剪映转场名称。"),
  transition_duration: timestamp.optional().describe("转场时长，单位微秒。"),
};
const animation = {
  in_animation: z.string().optional(),
  out_animation: z.string().optional(),
  loop_animation: z.string().optional(),
  in_animation_duration: timestamp.optional(),
  out_animation_duration: timestamp.optional(),
  loop_animation_duration: timestamp.optional(),
};

function timedItems(fields) {
  return z.array(z.looseObject({ ...timelineFields, ...fields })
    .refine((item) => item.end > item.start, {
      path: ["end"], message: "结束时间必须大于开始时间。",
    })).min(1);
}

const jsonLists = {
  add_videos: { video_infos: timedItems({ video_url: httpUrl, duration, volume, ...resolution, ...transition }) },
  add_audios: {
    audio_infos: timedItems({ audio_url: httpUrl, duration, volume, audio_effect: z.string().optional() }),
  },
  add_images: { image_infos: timedItems({ image_url: httpUrl, ...resolution, ...transition, ...animation }) },
  add_captions: {
    captions: timedItems({
      text: z.string().min(1),
      keyword: z.string().optional(),
      keyword_color: z.string().optional(),
      font_size: z.number().positive().optional(),
      ...animation,
    }),
  },
  add_effects: { effect_infos: timedItems({ effect_title: z.string().min(1) }) },
  add_filters: {
    filter_infos: timedItems({
      filter_title: z.string().min(1),
      intensity: z.number().min(0).max(100).optional(),
    }),
  },
  add_keyframes: {
    keyframes: z.array(z.object({
      segment_id: z.string().min(1).describe("添加素材返回的片段 ID。"),
      property: z.string().min(1).describe("属性名，例如 UNIFORM_SCALE 或 KFTypePositionX。"),
      offset: timestamp.describe("从片段起点算起的微秒偏移，与草稿全局时间无关。"),
      value: z.number().describe("关键帧属性值。"),
    })).min(1),
  },
};

const descriptions = {
  create_draft: "创建空白剪映草稿。传入画布宽高（像素），竖屏常用 1080×1920。返回 draft_url，后续编排和保存复用该链接。",
  save_draft: "保存当前草稿并返回 draft_url。添加完素材和字幕后调用。",
  get_draft: "获取已保存草稿的工程文件清单。传 draft_url 或 draft_id。",
  add_videos: "按时间轴添加一组视频。视频直链可由 media_upload 提供。返回轨道和片段 ID。",
  add_audios: "按时间轴添加一组配音、音乐或音效。时间单位为微秒。",
  add_images: "按时间轴添加一组图片。返回 segment_ids，可接 add_keyframes 添加动画。",
  add_sticker: "用 search_sticker 返回的 sticker_id 将贴纸放到指定时间区间。",
  add_keyframes: "按 segment_id 给已有片段设置缩放、位置、旋转或透明度关键帧。",
  add_captions: "批量写入已有标题、文字或字幕。每条文字指定微秒起止时间，可在工具层设置它们共用的字体和样式。",
  add_effects: "按名称和时间范围添加视频特效，可先用 get_effects 查名称。",
  add_filters: "按名称、时间范围和强度添加滤镜，可先用 get_filters 查名称。",
  add_masks: "给指定片段添加遮罩，返回遮罩 ID。",
  add_mask_keyframes: "对已有遮罩添加位置、尺寸等关键帧。",
  add_beauty: "为指定片段设置美颜、美型、美妆或美体。",
  add_text_style: "生成关键词高亮样式，供字幕编排使用。",
  easy_create_material: "在已有草稿中快速添加一段音频及可选的图片、视频和文字。由上游决定预设时长。",
  get_text_animations: "查询字幕可用的入场、出场和循环动画。",
  get_image_animations: "查询图片可用的入场、出场和循环动画。",
  get_filters: "查询可用滤镜名称和分类。",
  get_text_effects: "查询可用于字幕的花字效果。",
  get_effects: "查询可用视频特效名称和分类。",
  get_audio_duration: "读取音频直链的实际时长，返回 duration，单位微秒。",
  gen_video: "向 CapCut Mate 提交云端成片导出。线上调用会计费。提交成功后使用 gen_video_status 查询结果。",
  gen_video_status: "查询已提交的云端导出任务，成功时返回成片链接。",
  gen_video_active_count: "查询上游排队和进行中的云端导出数量。",
  get_points: "查询配置的简创账号积分余额。需要 CAPCUT_MATE_API_KEY。",
  timelines: "生成一组时间线区间，时间单位为微秒。",
  audio_timelines: "根据音频链接和各自时长生成连续时间线。",
  audio_infos: "将音频链接和已有时间线转换为 add_audios 所需的素材信息。",
  imgs_infos: "将图片链接和已有时间线转换为 add_images 所需的素材信息。",
  caption_infos: "将对应的文本和时间线转换成 add_captions 所需的字幕信息。",
  effect_infos: "将特效和时间线转换为特效片段信息。",
  filter_infos: "将滤镜和时间线转换为滤镜片段信息。",
  keyframes_infos: "根据片段信息、偏移和数值生成关键帧信息。",
  video_infos: "将视频链接和时间线转换为 add_videos 所需的素材信息。",
  search_sticker: "按关键词搜索剪映贴纸并返回可用于 add_sticker 的 ID。",
  get_url: "从文本里提取链接。",
  str_list_to_objs: "将给定的 JSON 字符串列表转为对象。",
  str_to_list: "将给定的字符串转为列表。",
  objs_to_str_list: "将给定的对象列表转为字符串列表。",
};
const mutations = new Set([
  "create_draft", "save_draft", "add_videos", "add_audios", "add_images", "add_sticker",
  "add_keyframes", "add_captions", "add_effects", "add_filters", "add_masks",
  "add_mask_keyframes", "add_beauty", "easy_create_material", "gen_video",
]);
const mediaFields = new Set(["video_url", "audio_url", "image_url", "img_url", "mp3_url", "links"]);
const serializedResults = {
  audio_infos: "infos", imgs_infos: "infos", caption_infos: "infos", effect_infos: "infos",
  filter_infos: "infos", video_infos: "infos", keyframes_infos: "keyframes_infos",
};
const draftLookup = z.strictObject({ draft_url: draftUrl.optional(), draft_id: draftId.optional() })
  .refine(({ draft_url, draft_id }) => Boolean(draft_url) !== Boolean(draft_id), "请提供 draft_url 或 draft_id，两者选一。");

function lookupId(args) {
  return args.draft_id ?? new URL(args.draft_url).searchParams.get("draft_id");
}

function loopbackMedia(value, key) {
  if (Array.isArray(value)) return value.some((item) => loopbackMedia(item, key));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([name, item]) => loopbackMedia(item, name));
  }
  if (!mediaFields.has(key) || typeof value !== "string" || !URL.canParse(value)) return false;
  const host = new URL(value).hostname;
  return host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]";
}

function inputSchema(name, wireSchema) {
  if (name === "get_draft") return draftLookup;
  const original = z.fromJSONSchema(wireSchema);
  const shape = { ...original.shape, ...jsonLists[name] };
  if ("draft_url" in shape) shape.draft_url = draftUrl;
  if (name === "gen_video") delete shape.apiKey;
  if (name === "create_draft") {
    shape.width = z.int().positive().optional().describe("画布宽度（像素），上游默认为 1920。");
    shape.height = z.int().positive().optional().describe("画布高度（像素），上游默认为 1080。");
  }
  if (name === "keyframes_infos") {
    shape.offsets = z.array(z.int().min(0).max(100)).min(1).describe("片段内的位置百分比，例如 [0, 100]。");
    shape.values = z.array(z.number()).min(1).describe("对应 offsets 的属性值。");
  }
  if (name === "add_captions") {
    shape.font = shape.font.describe("整批字幕共用的剪映字体名称。");
    shape.transform_y = shape.transform_y.describe("字幕垂直像素位移，沿用上游画布坐标。");
    shape.border_color = shape.border_color.describe("描边颜色，例如 #000000。");
  }
  for (const field of ["start", "end", "duration", "offset"]) {
    if (shape[field]) shape[field] = shape[field].describe(`${field}，单位微秒。`);
  }
  return z.strictObject(shape);
}

function errorData(operation, draft_url, code, message, details = {}) {
  return { operation, code, message, ...(draft_url ? { draft_url } : {}), retryable: false, ...details };
}

export function registerCapcutTools(server, { result, importDraft, env = process.env }) {
  const base = (env.CAPCUT_MATE_BASE_URL || officialBase).replace(/\/+$/, "");
  const apiKey = env.CAPCUT_MATE_API_KEY;
  const isOfficial = base === officialBase;
  const protectedMedia = (message) => apiKey ? message.replaceAll(apiKey, "[已隐藏凭据]") : message;
  const endpoints = {
    ...manifest.operations,
    get_points: { method: "GET", schema: { type: "object", properties: {} } },
  };

  function apiUrl(name) {
    const url = new URL(name === "get_points" ? pointsAddress : base + apiPrefix + name);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("CAPCUT_MATE_BASE_URL 必须为不含账号或查询参数的 HTTP(S) 地址。");
    }
    return url;
  }

  function lookupUrl(args) {
    const url = apiUrl("get_draft");
    url.searchParams.set("draft_id", lookupId(args));
    return url;
  }

  async function run(name, endpoint, args, signal) {
    const draft_url = args.draft_url;
    const readOnly = !mutations.has(name);
    if ((name === "get_points" || (name === "gen_video" && isOfficial)) && !apiKey) {
      return result(errorData(name, draft_url, "API_KEY_REQUIRED", "请在 MCP 环境中配置 CAPCUT_MATE_API_KEY。"), true);
    }
    if (isOfficial && loopbackMedia(args)) {
      return result(errorData(name, draft_url, "MEDIA_LINK_LOCAL_ONLY",
        "线上草稿 API 无法读取本机链接。请在配置中心设置公网直链后，重新使用素材服务返回的链接。"), true);
    }
    const url = name === "get_draft" ? lookupUrl(args) : apiUrl(name);
    const settings = { method: endpoint.method, redirect: "error" };
    if (name === "get_points") url.searchParams.set("apiKey", apiKey);
    if (endpoint.method === "POST") {
      const body = { ...args };
      for (const field of Object.keys(jsonLists[name] ?? {})) body[field] = JSON.stringify(body[field]);
      if (name === "keyframes_infos") {
        body.offsets = body.offsets.join("|");
        body.values = body.values.join("|");
      }
      if (name === "gen_video" && apiKey) body.apiKey = apiKey;
      settings.headers = { "Content-Type": "application/json" };
      settings.body = JSON.stringify(body);
    }
    const timeout = AbortSignal.timeout(120_000);
    settings.signal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    let body;
    try {
      response = await fetch(url, settings);
      body = await response.json();
    } catch (error) {
      const code = response ? "INVALID_UPSTREAM_RESPONSE" : timeout.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR";
      return result(errorData(name, draft_url, code, protectedMedia(error.message), {
        ...(response ? { http_status: response.status } : {}),
        retryable: readOnly && !signal?.aborted,
        outcome_unknown: !readOnly,
      }), true);
    }
    if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)
      || (body.code !== undefined && body.code !== 0)) {
      const upstreamCode = body?.code;
      const detail = body?.message ?? body?.msg ?? body?.detail;
      const message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "上游接口返回失败。";
      return result(errorData(name, draft_url, "UPSTREAM_ERROR", protectedMedia(message), {
        http_status: response.status,
        ...(upstreamCode === undefined ? {} : { upstream_code: upstreamCode }),
        retryable: readOnly && (response.status === 429 || response.status >= 500),
        outcome_unknown: !readOnly && response.status >= 500,
      }), true);
    }
    const field = serializedResults[name];
    if (field && typeof body[field] === "string") {
      try {
        const items = JSON.parse(body[field]);
        if (Array.isArray(items)) body[field] = items;
      } catch {
        // 原样交还上游结果，兼容旧接口返回的普通文本。
      }
    }
    return result(body);
  }

  for (const [name, endpoint] of Object.entries(endpoints)) {
    server.registerTool(name, {
      description: descriptions[name],
      inputSchema: inputSchema(name, endpoint.schema),
      annotations: {
        readOnlyHint: !mutations.has(name),
        destructiveHint: false,
        openWorldHint: true,
      },
    }, (args, extra) => run(name, endpoint, args, extra.signal));
  }

  server.registerTool("import_draft_to_jianying", {
    description: "通过正在运行的剪映小助手下载已保存的草稿，导入配置中心指定的本机剪映草稿箱。",
    inputSchema: draftLookup,
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (args, extra) => {
    const url = lookupUrl(args);
    try {
      const data = await importDraft(url.href, extra.signal);
      return result({ draft_url: url.href, ...data }, data.success === false);
    } catch (error) {
      return result(errorData("import_draft_to_jianying", url.href, error.code || "DRAFT_IMPORT_FAILED", error.message), true);
    }
  });
}
