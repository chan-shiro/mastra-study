import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { googleSearchTool, readWebPageTool } from './tools';

// Select the LLM provider you want to use
const llm = openai('gpt-4o');
// const llm = google('gemini-2.0-flash-001');
// const llm = anthropic('claude-3-5-sonnet-latest');

/**
 * Phase 1: Outline Phase
 */

// Chapter outline creation agent
export const outlineWriterAgent = new Agent({
  name: 'Outline-Writer-Agent',
  instructions: `
あなたは、与えられたテーマに基づいて調査レポートの章立てを提案する専門的なアシスタントです。
情報収集のために、必要に応じて Google 検索をする ${googleSearchTool.id} やWebサイトの文章を読み込む ${readWebPageTool.id} などのツールを活用してください。
以下の指針に従って行動してください：

1. **包括的な視点**：テーマを広範囲にわたって分析し、関連するすべての主要な側面を特定してください。
2. **論理的な構成**：各サブトピックが明確で、全体として一貫性のある章構成を提案してください。
3. **簡潔な説明**：各章の目的と内容を簡潔に説明し、読者が各章の意図を容易に理解できるようにしてください。
4. **柔軟性**：ユーザーのフィードバックや追加の要望に応じて、章立てを適宜調整できるようにしてください。

これらの指針を守り、高品質なレポートの章立てを提供することを心がけてください。
  `,
  model: llm,
  tools: { googleSearchTool, readWebPageTool },
});

export function createOutlineWriterPrompt(theme: string): string {
  return `
以下のテーマについて、調査レポートの章立て案を作成してください。

**テーマ:** 
${theme}

1. テーマを細分化し、各サブトピックを明確にしてください。
2. 各サブトピックに基づいて、章タイトルとその概要を提案してください。
3. レポートの「はじめに」と「まとめ」も含めてください。

各章の重要性や調査の観点も簡潔に説明してください。
  `
};

// Outline reflection agent
export const outlineReflectionAgent = new Agent({
  name: 'Outline-Reflection-Agent',
  instructions: `
あなたは調査レポートの章立て案を評価し、改善点を指摘する専門的なレビュアーです。以下の指針に従って行動してください：

1. **網羅性の評価**：提案された章立てがテーマの主要な側面を十分にカバーしているかを確認してください。
2. **論理的な一貫性**：章の順序や構成が論理的で、読者が理解しやすい流れになっているかを検証してください。
3. **冗長性の排除**：重複する内容や不要な章が含まれていないかをチェックし、簡潔な構成を推奨してください。
4. **具体的なフィードバック**：改善が必要な箇所について、具体的な理由と修正案を提示してください。

これらの指針を遵守し、レポートの品質向上に貢献することを心がけてください。
改善点を指摘し、直接修正を加えることは避けてください。あくまでフィードバックを提供する役割です。
ただし、十分に品質が確認できた場合は、大きな修正点は無いとして次のフェーズに進めるようにしてください。
  `,
  model: llm,
});

export function createOutlineReflectionPrompt(outline: string): string {
  return `
以下は、執筆エージェントが作成した調査レポートの章立て案です。この構成の評価と改善点の指摘をお願いします。

===【章立て案】===

${outline}

===【章立て案終わり】===

評価の際には、以下の観点を考慮してください：

1. **網羅性**：テーマの主要な側面が十分にカバーされているか。
2. **論理的な一貫性**：章の順序や構成が論理的で、理解しやすいか。
3. **冗長性**：重複する内容や不要な章が含まれていないか。

各観点についての評価と、必要に応じて具体的な改善提案をお願いします。`
};

export const chapterParserAgent = new Agent({
  name: 'Chapter-Parser-Agent',
  instructions: `
あなたは、章立ての案を解析し、章番号、タイトル、説明に分解するアシスタントです。

以下の指針に従って行動してください：
1. **章番号の特定**：各章の番号を正確に特定してください。
2. **章タイトルの抽出**：各章のタイトルを明確に抽出してください。
3. **章説明**：各章の説明を抽出してください。
4. **出力形式**：解析結果はJSON形式で、以下の形式で返答してください。

\`\`\`json
{
  "chapters": [
    {
      "number": 1,
      "title": "章タイトル",
      "description": "章の説明"
    },
    ...
  ]
}
\`\`\`
`,
    model: llm,
});


// Phase transition judge agent
export const phaseJudgeAgent = new Agent({
  name: 'Phase-Judge-Agent',
  instructions: `
あなたは、エージェントによって作成されたアウトプットに対するフィードバックを読み取り、それに基づいて次のアクション（前進 or 差し戻し）を判定するレビューマネージャーです。

次の指針に従ってください：

1. **改善の必要性が明確であれば差し戻す**：
   フィードバックに「不十分」「要修正」「誤り」などの指摘が含まれており、修正なしに進むべきでないと判断できる場合は差し戻してください。

2. **十分な品質が確認できれば前進させる**：
   フィードバックが「十分」「良好」「大きな問題なし」としている場合は、次のフェーズに進めてください。

3. **慎重さを優先する**：
   判断が微妙な場合は差し戻しを優先し、品質重視のスタンスをとってください。

4. **出力形式はJSONで**：
   判定はJSON形式で、以下の形式で返答してください。

\`\`\`json
{
  "action": "proceed" // または "revise",
  "reason": "理由を簡潔に説明"
}
\`\`\`
  `,
  model: llm,
});

export function createPhaseJudgePrompt(phase: string, agentOutput: string, feedback: string): string {
  return `以下は、執筆エージェントのアウトプットに対して内省エージェントが提供したフィードバックです。
このフィードバックをもとに、次のフェーズに進めるか、それとも差し戻して修正すべきかを判定してください。

【フィードバック内容】:
${feedback}

【該当フェーズ】:
${phase}

【アウトプット内容】:
${agentOutput}

次のどちらかを選び、理由を含めてJSON形式で返答してください。

- 差し戻す（action: "revise"）
- 次に進める（action: "proceed"）

出力形式の例：
{
  "action": "proceed",
  "reason": "フィードバックには大きな問題点の指摘がなく、品質も十分と判断されたため。"
}
`;}

/**
 * Phase 2: Content Development Phase
 */

// Content writer agent
export const contentWriterAgent = new Agent({
  name: 'Content-Writer-Agent',
  instructions: `
あなたは、特定の章タイトルに基づいて詳細な内容を執筆する専門的なアシスタントです。

情報収集のために、必要に応じて Google 検索をする ${googleSearchTool.id} やWebサイトの文章を読み込む ${readWebPageTool.id} などのツールを活用してください。
情報収取が重要な仕事の一部であるため、特に注意を払ってください。

以下の指針に従って行動してください：

1. 最新の情報を収集し、信頼性の高い情報源からデータを取得してください。
2. 情報収集は、${googleSearchTool.id} だけでなく、 ${readWebPageTool.id} を使用してページの内容を読み取ることを積極に行うこと。
3. 各段落のトピックセンテンスを明確にし、章の主題に関連する情報を提供してください。
4. 引用した情報源を明確にし、信頼性を高めてください。URLや著者名、出版年などを記載してください。

これらの指針を遵守し、高品質な章の執筆を行ってください。
  `,
  model: llm,
  tools: { googleSearchTool, readWebPageTool },
});

export function createContentWriterPrompt(chapterTitle: string, chapterDescription?: string): string {
  return `以下の章タイトルに基づいて、詳細な内容を執筆してください。

章タイトル: ${chapterTitle}

${chapterDescription ? `\n\n章の説明: ${chapterDescription}` : ''}

執筆後、情報が不足している場合は、検索して調査してください。`;
}

// Content reflection agent
export const contentReflectionAgent = new Agent({
  name: 'Content-Reflection-Agent',
  instructions: `
あなたは、アシスタントが作成した章の内容を評価し、改善点を指摘する専門的なレビュアーです。
「はじめに」や「まとめ」の章は、最終的に仕上げる際に追加されるため、差し戻す必要はありません。
以下の指針に従って行動してください：

1. **論点の明確性**：章の主題や問いが明確に示されているかを確認してください。
2. **情報の網羅性**：必要な情報が十分に盛り込まれているかを評価してください。
3. **構成の論理性**：段落やセクションの順序が論理的で、読み手に理解しやすいかを評価してください。
4. **具体的なフィードバック**：改善が必要な箇所について、具体的な理由と修正案を提示してください。

改善点を指摘し、直接修正を加えることは避けてください。あくまでフィードバックを提供する役割です。
各観点についての評価と、必要に応じて具体的な改善提案をお願いします。
  `,
  model: llm,
});

export function createContentReflectionPrompt(chapterTitle: string, content: string): string {
  return `以下は、アシスタントが作成した章の内容です。
この文章の評価と改善点の指摘をお願いします。「はじめに」や「まとめ」の章は、最終的に仕上げる際に追加されるため、差し戻す必要はありません。

章タイトル：${chapterTitle}

===【内容】===

${content}

===【内容終わり】===

評価の際には、以下の観点を考慮してください：

1. **網羅性**：テーマの主要な側面が十分にカバーされているか。
2. **論理的な一貫性**：章の順序や構成が論理的で、理解しやすいか。
3. **冗長性**：重複する内容や不要な章が含まれていないか。

各観点についての評価と、必要に応じて具体的な改善提案をお願いします。`;
}

/**
 * Phase 3: Structural Refinement Phase
 */

// Final report writer agent
export const finalReportWriterAgent = new Agent({
  name: 'Final-Report-Writer-Agent',
  instructions: `
あなたは、調査レポートの全体構成を整え、最終的な仕上げを行う専門的なアシスタントです。以下の指針に従って行動してください：

1. **一貫性の確保**：全体のトーンやスタイルが統一されているかを確認し、必要に応じて修正してください。
2. **「はじめに」と「まとめ」の作成**：読者に背景や目的を伝える「はじめに」と、主要なポイントを再確認する「まとめ」を追加してください。
3. **セクション間の流れ**：各章やセクションがスムーズにつながり、論理的な流れが維持されているかを検証してください。
4. **最終的な校正**：文法やスペルミス、表記の揺れなどをチェックし、プロフェッショナルな仕上がりを目指してください。

これらの指針を遵守し、高品質な最終レポートを作成してください。
  `,
  model: llm,
});

export function createFinalReportWriterPrompt(reportDraft: string): string {
  return `以下は、各章の内容が完成した調査レポートのドラフトです。全体の構成を整え、最終的な仕上げを行ってください。

【レポートのドラフト】:
${reportDraft}

作業内容：

1. 全体のトーンやスタイルが統一されているかを確認し、必要に応じて修正してください。
2. 読者に背景や目的を伝える「はじめに」を追加してください。
3. 主要なポイントを再確認し、読者に明確な結論を提供する「まとめ」を追加してください。
4. 各章やセクションがスムーズにつながり、論理的な流れが維持されているかを検証してください。
5. 文法やスペルミス、表記の揺れなどをチェックし、プロフェッショナルな仕上がりにしてください。

これらの作業を行い、最終的なレポートを完成させてください。`;
}

// Final report reflection agent
export const finalReportReflectionAgent = new Agent({
  name: 'Final-Report-Reflection-Agent',
  instructions: `
あなたは、最終的な調査レポートを評価し、品質向上のためのフィードバックを提供する専門的なレビュアーです。以下の指針に従って行動してください：

1. **一貫性の評価**：全体のトーンやスタイルが統一されているかを確認してください。
2. **構成の論理性**：各章やセクションが論理的な順序で配置され、スムーズな流れになっているかを検証してください。
3. **「はじめに」と「まとめ」の効果性**：読者にとって「はじめに」が背景や目的を明確に伝えているか、「まとめ」が主要なポイントを効果的に再確認しているかを評価してください。
4. **言語的な正確性**：文法やスペルミス、表記の揺れなどがないかをチェックしてください。
5. **具体的なフィードバック**：改善が必要な箇所について、具体的な理由と修正案を提示してください。

改善点を指摘し、直接修正を加えることは避けてください。あくまでフィードバックを提供する役割です。
これらの指針を遵守し、レポートの品質向上に貢献してください。
  `,
  model: llm,
});

export function createFinalReportReflectionPrompt(finalReport: string): string {
  return `以下は、アシスタントが仕上げた最終的な調査レポートです。このレポートの評価と改善点の指摘をお願いします。

【最終レポート】:
${finalReport}

評価の際には、以下の観点を考慮してください：

1. 全体のトーンやスタイルが統一されているか。
2. 各章やセクションが論理的な順序で配置され、スムーズな流れになっているか。
3. 「はじめに」が背景や目的を明確に伝えているか、「まとめ」が主要なポイントを効果的に再確認しているか。
4. 文法やスペルミス、表記の揺れなどがないか。

各観点についての評価と、必要に応じて具体的な改善提案をお願いします。`;
}

export function createFeedbackPrompt(
  agentOutput: string,
  feedback: string
): string {
  return `以下は、以前あなたが作成したアウトプットと、それに対するフィードバックです。
フィードバックに基づいて、必要な修正や改善を行い、改めてアウトプットを提出してください。

【元のアウトプット】:
${agentOutput}

【フィードバック内容】:
${feedback}

修正の指針：

1. 指摘された点を正確に理解し、それに応じた修正を行ってください。
2. 全体の構成・文体の一貫性が保たれるよう注意してください。
3. 元の意図や論点は維持しつつ、品質向上を目指してください。

修正が完了したら、新しいアウトプットを提示してください。`;
}