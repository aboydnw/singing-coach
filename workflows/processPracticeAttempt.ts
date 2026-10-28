import {
  analyzeAttempt,
  claimAttemptWork,
  claimCoaching,
  coachAttempt,
  completeAttempt,
  failAttempt,
  persistAnalysis,
} from "@/workflows/practiceAttemptSteps";

export async function processPracticeAttempt(jobId: string) {
  "use workflow";
  let phase: "analysis" | "coaching" | "completion" = "analysis";
  try {
    const resumePoint = await claimAttemptWork(jobId);
    let attemptId: string;
    if (resumePoint.stage === "analysis") {
      const analysis = await analyzeAttempt(jobId);
      attemptId = await persistAnalysis(jobId, analysis);
      await claimCoaching(jobId);
    } else {
      attemptId = resumePoint.attemptId;
    }
    phase = "coaching";
    const coaching = await coachAttempt(jobId, attemptId);
    phase = "completion";
    await completeAttempt(jobId, attemptId, coaching);
  } catch (error) {
    await failAttempt(jobId, {
      code: `${phase}_failed`,
      message: error instanceof Error ? error.message : "Attempt processing failed.",
    });
    throw error;
  }
}
