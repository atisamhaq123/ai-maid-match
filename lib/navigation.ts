export function safeNext(v:unknown){if(v==='/reset-password')return v;if(typeof v==='string'&&/^\/app\?invite=[a-f0-9]{64}$/.test(v))return v;return '/app';}
