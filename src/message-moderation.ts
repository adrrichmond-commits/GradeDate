import { logInfo, logWarn } from "./observability";
import { OPENAI_PROVIDER, openAiConfigured, scanMessageWithOpenAi } from "./openai-moderation";

export const MESSAGE_FLAG_TYPES = ["underage_solicitation","csam_or_underage","trafficking_or_exploitation","impersonation","contact_exchange","sexual_solicitation","spam_or_scam","harassment_or_abuse","inappropriate_or_explicit","other"] as const;
export type MessageFlagType = typeof MESSAGE_FLAG_TYPES[number];
export type MessageScanResult = { classification: MessageFlagType | "clean" | "error"; confidence: number | null; matchedRules: string[]; providerRef: string | null; source: "heuristic" | "provider" };
const clamp=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):null;
export function normalizeMessageText(input:string): string { return input.normalize("NFKC").toLowerCase().replace(/[\u200b-\u200f\u2060]/g,"").replace(/[@4]/g,"a").replace(/[3]/g,"e").replace(/[1!|]/g,"i").replace(/[0]/g,"o").replace(/[5$]/g,"s").replace(/[7]/g,"t").replace(/[._\-]+/g," ").replace(/\s+/g," ").trim(); }
const has=(s:string,re:RegExp)=>re.test(s);
export function scanMessageHeuristics(content:string): MessageScanResult {
 const s=normalizeMessageText(content), rules:string[]=[]; let classification:MessageScanResult["classification"]="clean";
 const minor=has(s,/(\bminor\b|under ?age|under 18|below 18|\b(1[0-7])\s*(yo|y\/o|years? old)\b|just turned 18|schoolgirl)/);
 const sexual=has(s,/(sex|nude|naked|explicit|hookup|dick|pussy|blowjob|oral|fuck|send (?:pics|nudes)|sleep with)/);
 const meeting=has(s,/(meet|come over|hotel|room|private|pick you up|take you away)/);
 if (minor && sexual && (meeting || !/schoolgirl/.test(s))) { classification=minor&&sexual&&meeting?"underage_solicitation":"csam_or_underage"; rules.push("minor_sexual_context"); if(meeting)rules.push("minor_meeting_request"); }
 const recruit=has(s,/(recruit|job|work|travel|escort|modeling|massage|club)/), control=has(s,/(pay|payment|money|cash|fee|commission|passport|documents?|control|handler|transport|flight|ticket|debt)/);
 if(classification==="clean"&&recruit&&control){classification="trafficking_or_exploitation";rules.push("recruitment_control_combo");}
 if(classification==="clean"&&has(s,/(i am|i'm|we are|official|staff|police|fbi|celebrity|famous|law enforcement)/)&&has(s,/(real name|prove|verify|trust me|send|give me|not who|fake|pretend)/)){classification="impersonation";rules.push("authority_identity_deception");}
 if(classification==="clean"&&has(s,/(\+?\d[\d ()-]{7,}\d|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|@[a-z0-9_]{3,}|bitcoin|btc|crypto wallet)/)){classification="contact_exchange";rules.push("contact_identifier");}
 if(classification==="clean"&&has(s,/(pay me for sex|sex for money|cash for sex|sugar daddy|send nudes|want to have sex\??)/)){classification="sexual_solicitation";rules.push("sexual_offer_or_request");}
 if(classification==="clean"&&has(s,/(send money|invest|guaranteed returns|gift card|wire transfer)/)&&has(s,/(today|now|urgent|account|wallet|profit|investment)/)){classification="spam_or_scam";rules.push("payment_scam_combo");}
 return {classification, confidence:classification==="clean"?null:Math.min(.99,.68+rules.length*.1), matchedRules:rules, providerRef:null, source:"heuristic"};
}
export function classifyMessageScan(payload:unknown):MessageScanResult { if(!payload||typeof payload!=="object")return {classification:"error",confidence:null,matchedRules:[],providerRef:null,source:"provider"}; const p=payload as Record<string,unknown>; const raw=String(p.classification??p.category??p.result??"").toLowerCase().replace(/[ -]/g,"_"); const aliases:Record<string,MessageScanResult["classification"]>={underage:"csam_or_underage",csam:"csam_or_underage",trafficking:"trafficking_or_exploitation",exploitation:"trafficking_or_exploitation",impersonation:"impersonation",contact_exchange:"contact_exchange",sexual_solicitation:"sexual_solicitation",spam:"spam_or_scam",scam:"spam_or_scam",clean:"clean"}; const classification=aliases[raw]??(MESSAGE_FLAG_TYPES.includes(raw as MessageFlagType)?raw as MessageFlagType:"error"); return {classification,confidence:clamp(p.confidence??p.score),matchedRules:Array.isArray(p.matched_rules)?p.matched_rules.filter((x):x is string=>typeof x==="string"):[],providerRef:typeof p.id==="string"?p.id:typeof p.reference==="string"?p.reference:null,source:"provider"}; }
export function messageModerationConfigured(env:Record<string,string|undefined>=process.env){return !!env.MODERATION_MESSAGE_PROVIDER;}
function isHttpUrl(value: string): boolean { return /^https?:\/\//i.test(value); }
/**
 * Scan message content with the configured provider.
 *  - MODERATION_MESSAGE_PROVIDER=openai -> OpenAI Moderation endpoint (uses
 *    the existing OPENAI_API_KEY; missing key fails closed as "error").
 *  - MODERATION_MESSAGE_PROVIDER=http(s)://... -> legacy generic HTTP provider.
 *  - Unknown provider values fail closed as "error".
 *  - Unset provider -> disabled (returns "clean" without calling anything).
 */
export async function scanMessage(content:string,env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch):Promise<MessageScanResult>{
 const provider=env.MODERATION_MESSAGE_PROVIDER;
 if(!provider){logInfo("message_moderation.disabled",{});return {classification:"clean",confidence:null,matchedRules:[],providerRef:null,source:"provider"};}
 if(provider===OPENAI_PROVIDER){
   if(!openAiConfigured(env)){logWarn("message_moderation.unconfigured",{provider,reason:"openai_api_key_missing"});return {classification:"error",confidence:null,matchedRules:[],providerRef:"openai_api_key_missing",source:"provider"};}
   return scanMessageWithOpenAi(content,env,fetcher);
 }
 if(!isHttpUrl(provider)){logWarn("message_moderation.unconfigured",{provider,reason:"unknown_provider"});return {classification:"error",confidence:null,matchedRules:[],providerRef:"unknown_provider",source:"provider"};}
 const url=provider;const c=new AbortController(), timer=setTimeout(()=>c.abort(),15000);try{const r=await fetcher(url,{method:"POST",signal:c.signal,headers:{"content-type":"application/json",...(env.MODERATION_MESSAGE_API_KEY?{authorization:`Bearer ${env.MODERATION_MESSAGE_API_KEY}`}:{})},body:JSON.stringify({text:content})});if(!r.ok)throw Error(`provider_http_${r.status}`);return classifyMessageScan(await r.json());}catch(error){logWarn("message_moderation.scan_failed",{error:error instanceof Error?error.message:"unknown"});return {classification:"error",confidence:null,matchedRules:[],providerRef:null,source:"provider"};}finally{clearTimeout(timer);}}
export function policyForMessageScan(r:MessageScanResult){if(r.classification==="underage_solicitation"||r.classification==="csam_or_underage")return {hide:true,lockAccount:true,urgent:true};if(r.classification==="trafficking_or_exploitation")return {hide:true,lockAccount:false,urgent:true};return {hide:false,lockAccount:false,urgent:false};}
/** Map a user-facing report reason to the message-moderation classification
 * used by the admin queue. Unknown/absent reasons fall back to "other" so a
 * user report always lands in the queue with a stable flag type. */
export const USER_REPORT_FLAG_MAP: Record<string, MessageFlagType> = {
  underage: "csam_or_underage",
  spam: "spam_or_scam",
  fake_profile: "impersonation",
  harassment: "harassment_or_abuse",
  inappropriate_photo: "inappropriate_or_explicit",
  other: "other",
};
export function messageFlagTypeForReportReason(reason: string): MessageFlagType {
  return USER_REPORT_FLAG_MAP[reason] ?? "other";
}
/** Reuse the existing zero-tolerance message policy so a user-reported
 * underage/CSAM message gets exactly the same protective action (hide +
 * lock_account) as a heuristically or provider-flagged one. */
export function userReportPolicyForClassification(classification: MessageFlagType): { hide: boolean; lockAccount: boolean; urgent: boolean } {
  return policyForMessageScan({ classification, confidence: 1, matchedRules: [], providerRef: null, source: "heuristic" });
}
