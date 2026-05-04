/** User-visible strings — witty professor persona (MCQ faculty UI). */

export const professorMcq = {
	emptyTitle: "No questions yet",
	emptyDescription:
		"The silence is admirable, but pedagogically thin. Add your first MCQ when ready.",
	deleteTitle: "Remove this question?",
	deleteDescription:
		"Shred this question? Even my worst exams got a second glance. This cannot be undone.",
	saveCreateSuccess: "Splendid. Another pearl for the quiz necklace.",
	saveUpdateSuccess: "Revised with care. The class will never know—unless they peek.",
	deleteSuccess: "Into the archives it goes.",
	loadError: "The registrar fumbled the scrolls. Try again.",
	unauthorized: "Your hall pass appears to have expired.",
	validationSummary: "Every multiple-choice needs a victor—tag one option as correct.",

	/** Preview dialog — student-style attempt, then feedback (faculty GET still carries `is_correct`; UI hides it until submit). */
	previewDialogTitle: "Preview",
	previewAttemptDescription:
		"Answer as a student would—feedback appears only after you submit.",
	previewPickFirstHint: "Select an option, then submit.",
	previewSubmitAnswer: "Submit answer",
	previewTryAgain: "Try again",
	previewResultHeadlineCorrect: "Correct",
	previewResultBodyCorrect: "Right on the mark. The students will feel that one.",
	previewResultHeadlineIncorrect: "Incorrect",
	previewResultBodyIncorrect:
		"Not this time—and here is the keyed answer for your notes.",
	previewBadgeYourCorrect: "Your answer — correct",
	previewBadgeYourIncorrect: "Your answer — incorrect",
	previewBadgeCorrectKey: "Correct answer",
} as const;
