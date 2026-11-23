// 提示词层：把所有"台阶"玩法翻译成给模型的指令。
// 原则：不给答案优先；用户明确要下一级才升级；最后强制输出【类型：xx】便于统计。
import type { ChatMsgParam } from './types'

export interface SubmitInput {
  code: string
  error: string
}

const SYSTEM_BASE =
  '你是一个编程陪练教练，叫「台阶」。你的教学法：绝不直接给学生完整答案，' +
  '而是像上台阶一样逐级引导他自己走到答案。你用中文回复，语言口语化、简洁，' +
  '像耐心的学长，不啰嗦。' +
  '铁律：L1、L2 阶段禁止输出任何可以直接粘贴替换的修复代码行；也不要写“把第 N 行改成 X”。' +
  'L1 只谈现象和方向（大概率是哪里、往哪个概念上想），L2 可以谈步骤与核心概念并允许示意性伪代码（不是目标语言的成品）。'

/** 提交场景：分类 + L1 方向提示 */
export function buildSubmitMessages(input: SubmitInput): ChatMsgParam[] {
  return [
    { role: 'system', content: SYSTEM_BASE },
    {
      role: 'user',
      content:
        `学生给你一段出错的代码和报错信息。按下面的结构回复：\n\n` +
        `【判断】一句话说明这是什么类型的错误，以及你这么判断的依据。\n` +
        `【方向】L1 提示：问题可能出在哪一环节、该往哪个概念上想。只给方向，不给代码，不说破完整答案。\n` +
        `【下一步】告诉学生接下来可以自己怎么验证这个猜想（一句）。\n` +
        `【类型：错误类型名】\n\n` +
        `错误类型名请从这些里挑最贴切的一个：空值访问错误 / 数组越界 / 类型不匹配 / 异步时序问题 / 作用域与变量问题 / 逻辑错误 / 语法错误 / 环境与依赖问题 / 其他。\n\n` +
        `学生的代码：\n\`\`\`\n${input.code}\n\`\`\`\n\n` +
        `报错信息：\n${input.error}\n`,
    },
  ]
}

const LEVEL_INSTRUCTION: Record<number, string> = {
  2:
    '学生说 L1 的提示不够，卡住了。现在给 L2：把解决这个问题的关键步骤按顺序讲出来（2~4 步），' +
    '点明用到的核心概念或语言特性。可以用伪代码示意结构，但不要给出能直接粘贴运行的成品代码，也不要逐行改写他的代码。' +
    '结尾问他哪一步没把握。',
  3:
    '学生尝试后仍然失败，明确要求 L3。现在给最小修复：指出需要改动的最小范围（改哪一处、为什么），' +
    '并给出关键修复代码片段。改动范围越小越好，不要顺手重构。最后用一句话说清这个改法背后的原理。',
}

/** 升级场景：在已有对话上要求下一级提示 */
export function buildUpgradeMessage(level: 2 | 3): ChatMsgParam {
  return {
    role: 'user',
    content: LEVEL_INSTRUCTION[level],
  }
}

const VARIANT_SYSTEM =
  '你是一个出题老师。根据刚才辅导过的错误类型和知识点，出一道变式题来检验学生是否真正理解。' +
  '要求：场景类似但细节不同（不同的变量名、不同的数据形态、不同的出错位置），难度相当或略高。' +
  '只出题，不解答。格式：先一句话说明考查的知识点，然后给出题目描述和一段含有该错误的示例代码（代码可以缩略）。'

/** 变体题场景：基于最近对话生成一道变式题 */
export function buildVariantMessage(recentSummary: string): ChatMsgParam {
  return {
    role: 'user',
    content: `刚才我们辅导了这样的问题：\n${recentSummary}\n\n请根据这个知识点出一道变式题。`,
  }
}

/** 批改场景：学生提交自己写的变式题答案 */
export function buildCheckVariantMessages(question: string, answer: string): ChatMsgParam[] {
  return [
    { role: 'system', content: SYSTEM_BASE },
    {
      role: 'user',
      content:
        `刚才你出了一道变式题：\n${question}\n\n` +
        `学生自己写的答案是：\n\`\`\`\n${answer}\n\`\`\`\n\n` +
        `请批改，按这个结构回复：\n` +
        `【结论】对 / 基本对但不完整 / 不对（选一个）。\n` +
        `【卡在哪】如果没完全对，指出他思路断在哪一步，或者漏了什么情况。别直接给完整答案。\n` +
        `【再问一句】提一个问题点他一下，让他自己补上。\n\n` +
        `如果他写对了，就明确肯定，并说一句这类题以后怎么自查。`,
    },
  ]
}

/** 从 assistant 回复中提取【类型：xx】分类标签（兼容半角冒号与空格） */
export function extractCategory(text: string): string | undefined {
  const m = text.match(/【\s*类型\s*[:：]\s*([^】]+)】/)
  if (!m) return undefined
  return m[1].trim()
}

/**
 * 粗判 L1/L2 回复是否「漏了答案」：出现代码块，且代码块里有赋值/返回/函数调用等成品痕迹。
 * 只做提示，不拦截——模型偶尔会给伪代码，由用户自己判断。
 */
export function looksLikeLeak(text: string): boolean {
  const blocks = [...text.matchAll(/```[\s\S]*?```/g)].map(m => m[0])
  if (blocks.length === 0) return false
  const code = blocks.join('\n')
  // 伪代码常见特征：<- 、步骤编号、中文描述；成品代码常见特征：= 、return 、=> 、( )
  const hasRealCode = /[=;]|\breturn\b|=>|\w+\s*\(/.test(code)
  const isPseudo = /<-|步骤[一二三四1-9]|第一步|然后|伪代码/.test(code)
  return hasRealCode && !isPseudo
}
