import {
  analyzeAttempt,
  claimAnalysis,
  claimCoaching,
  coachAttempt,
  completeAttempt,
  failAttempt,
  persistAnalysis,
} from "@/workflows/practiceAttemptSteps";

export async function processPracticeAttempt(jobId: string) {
  "use workflow";
  try {
    await claimAnalysis(jobId);
    const analysis = await analyzeAttempt(jobId);
    const attemptId = await persistAnalysis(jobId, analysis);
    await claimCoaching(jobId);
    const coaching = await coachAttempt(jobId, attemptId);
    await completeAttempt(jobId, attemptId, coaching);
  } catch (error) {
    await failAttempt(jobId, {
      code: "processing_failed",
      message: error instanceof Error ? error.message : "Attempt processing failed.",
    });
    throw error;
  }
}
