// 离线演示模式：不连网关，按预录脚本逐字吐出来。
// 用途：会场网络不稳 / Key 额度用完 / 评委想先看看长什么样。
// 触发：设置页点「离线演示」按钮，或 URL 带 ?demo=1。

import type { StreamChunk } from './types'

/** 演示用的那道题（贯穿全程，保证观众看得懂上下文） */
export const DEMO_CODE = `function getUser(id) {
  return users.find(u => u.id === id).name
}

console.log(getUser(1))
console.log(getUser(99))`

export const DEMO_ERROR = `TypeError: Cannot read properties of undefined (reading 'name')
    at getUser (app.js:2:42)
    at app.js:6:13`

const L1 = `【判断】这是典型的空值访问错误：\`users.find(...)\` 没找到人时返回 \`undefined\`，你紧接着就取了 \`.name\`，于是在 \`undefined\` 上读属性就炸了。注意报错里两次调用只有第二次出错——这本身就是个线索。

【方向】先别急着改代码，想一想：\`find\` 在「找到了」和「没找到」两种情况下分别返回什么？你的这行代码假设了其中哪一种？

【下一步】把 \`users.find(...)\` 的返回值先单独 \`console.log\` 出来，看第二次调用时它到底是什么。

【类型：空值访问错误】`

const L2 = `行，我们把这一步拆开。

关键步骤：
1. 先把查找结果存到一个变量里，别一行连着写——你要看得见中间值。
2. 判断这个结果是不是「没找到」的状态。这里要想清楚：\`find\` 找不到时返回的是 \`null\` 还是 \`undefined\`？两者判空写法一样吗？
3. 没找到时给调用方一个明确的答复（返回什么由你定，但要提前想好调用方会怎么用）。
4. 找到了才去取 \`.name\`。

伪代码示意：

\`\`\`
候选 = 在列表里找 id 匹配的那一个
如果 候选 不存在 → 返回一个「没有」的表达
否则 → 返回 候选 的名字
\`\`\`

注意第 3 步是这道题真正的考点：**出错的位置和该负责任的位置不是同一处**。你的炸点在第 2 行取 \`.name\`，但该负责的是调用方怎么处理「查无此人」。

哪一步没把握？`

const L3 = `最小修复：只动 \`getUser\`，不改调用方。

\`\`\`js
function getUser(id) {
  const user = users.find(u => u.id === id)
  if (!user) return null        // 查无此人，明确告诉调用方
  return user.name
}
\`\`\`

改了两处：把查找结果先接住，再用 \`if (!user)\` 提前返回。

为什么这样改：\`find\` 找不到返回 \`undefined\`，而 \`!user\` 同时挡住 \`undefined\` 和 \`null\`，所以调用方不会拿到「半个结果」。记住这个模式——**先在边界上把「没有」处理掉，后面的代码就可以假设它一定存在**。

（顺带一提：直接返回 \`null\` 只是其中一种选择。如果你的调用方更希望「找不到就报错」，那就该在函数里抛异常。这属于设计取舍，不是对错。）`

const VARIANT = `考查知识点：**函数返回值的「缺失态」处理**——和刚才同一个坑，但换了个形状。

题目：下面这段代码在「购物车里没有这个商品」时会崩。找出崩点，并说明你会让 \`getItemPrice\` 在找不到时返回什么、为什么。

\`\`\`js
const cart = [
  { sku: 'A-1', price: 12 },
  { sku: 'B-7', price: 30 },
]

function getItemPrice(sku) {
  const item = cart.filter(c => c.sku === sku)[0]
  return item.price * 1.1
}

console.log(getItemPrice('C-9'))
\`\`\`

提示方向（别急着看代码）：这次用的不是 \`find\` 而是 \`filter\`。想想 \`filter\` 一个都没匹配上时，返回的是 \`undefined\` 还是一个空的东西？取 \`[0]\` 会得到什么？

写出你的思路就行，不用完整可运行。`

const CHECK = `【结论】基本对但不完整。

【卡在哪】你抓住了「\`filter\` 没匹配时返回空数组，取 \`[0]\` 得到 \`undefined\`」这一点，方向是对的。漏掉的是后半句：\`undefined\` 之后还有个 \`* 1.1\` 的运算，所以就算你挡住了 \`.price\`，如果返回值设计成 \`undefined\` 让调用方去乘，坑只是往后挪了一格。

【再问一句】你打算让 \`getItemPrice\` 在找不到时返回什么？如果返回 \`0\`，调用方会以为这东西免费；如果返回 \`null\`，调用方一乘就又崩。那到底该谁负责判断「不存在」？`

interface DemoStep {
  match: (lastUserText: string) => boolean
  reply: string
}

const STEPS: DemoStep[] = [
  { match: t => t.includes('L2') || t.includes('L1 提示不够'), reply: L2 },
  { match: t => t.includes('L3'), reply: L3 },
  { match: t => t.includes('变式题'), reply: VARIANT },
  { match: t => t.includes('我的答案'), reply: CHECK },
]

/**
 * 伪流式：把预录文本按小块吐出来，模拟真实打字节奏。
 * 返回值与真实 streamChat 同构，调用方无需区分。
 */
export async function* demoStream(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  let reply = L1
  for (const s of STEPS) {
    if (s.match(lastUser)) {
      reply = s.reply
      break
    }
  }

  const CHUNK = 3
  for (let i = 0; i < reply.length; i += CHUNK) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    yield { content: reply.slice(i, i + CHUNK), done: false }
    // 轻微延迟，让"正在想"和逐字出现看起来像真的
    await new Promise(r => setTimeout(r, 12))
  }
  yield { content: '', done: true }
}
