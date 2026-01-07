import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface InterviewQuestion {
  question: string;
  why: string;
  talkingPoints: string[];
  framework: string;
}

interface GeneratedMaterials {
  tailoredResume: string;
  coverLetter: string;
  interviewQuestions: InterviewQuestion[];
}

export async function generateMaterials(
  masterResume: string,
  jobDescription: string,
  companyName?: string
): Promise<GeneratedMaterials> {
  const [tailoredResume, coverLetter, interviewQuestions] = await Promise.all([
    generateTailoredResume(masterResume, jobDescription),
    generateCoverLetter(masterResume, jobDescription, companyName),
    generateInterviewQuestions(jobDescription, masterResume),
  ]);

  return { tailoredResume, coverLetter, interviewQuestions };
}

async function generateTailoredResume(masterResume: string, jobDescription: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are an expert resume writer. Given a master resume and a job description, create a tailored resume that emphasizes the most relevant experience.

MASTER RESUME:
${masterResume}

JOB DESCRIPTION:
${jobDescription}

INSTRUCTIONS:
1. Identify the top 5-7 requirements from the job description
2. Reorder resume sections to lead with the most relevant experience
3. Adjust bullet point language to mirror keywords from the job description
4. Cut or minimize irrelevant details
5. Stay 100% truthful to the actual experience - never fabricate
6. Output in clean Markdown format

Output ONLY the tailored resume in Markdown format, no explanations or preamble.`
    }]
  });

  return (response.content[0] as any).text;
}

async function generateCoverLetter(
  masterResume: string,
  jobDescription: string,
  companyName?: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an expert cover letter writer. Write a compelling, personalized cover letter.

RESUME:
${masterResume}

JOB DESCRIPTION:
${jobDescription}

COMPANY: ${companyName || 'the company'}

INSTRUCTIONS:
1. Write 3-4 paragraphs, 250-350 words total
2. Use a conversational, warm tone - NOT stiff or corporate
3. Open with a genuine hook about the company or role (not "I am excited to apply")
4. Connect 2-3 specific experiences from the resume to their top requirements
5. Show you understand what they need and how you can help
6. Close with enthusiasm and a clear call to action
7. Avoid generic phrases like "I believe I would be a great fit" or "I am confident that"
8. Output in clean Markdown format

Output ONLY the cover letter in Markdown format, no explanations or preamble.`
    }]
  });

  return (response.content[0] as any).text;
}

async function generateInterviewQuestions(
  jobDescription: string,
  tailoredResume: string
): Promise<InterviewQuestion[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are an expert interview coach. Generate likely interview questions based on this job and candidate.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${tailoredResume}

Generate 12-15 interview questions spanning:
- Behavioral questions ("Tell me about a time...")
- Role-specific technical questions
- Company/culture fit questions

For EACH question, provide:
1. "question": The interview question itself
2. "why": What the interviewer is really trying to learn (1-2 sentences)
3. "talkingPoints": Array of 2-3 specific points from the resume to reference
4. "framework": A brief answer structure suggestion (1-2 sentences)

Output as a JSON array. Output ONLY valid JSON, no explanations or markdown code blocks.`
    }]
  });

  try {
    const text = (response.content[0] as any).text;
    // Handle case where response might have markdown code blocks
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse interview questions:', e);
    return [];
  }
}
