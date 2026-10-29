import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { fetchCourseById } from "../../store/slices/coursesSlice";
import {
    completeLessonAsync,
    fetchMyEnrollments,
} from "../../store/slices/enrollmentSlice";

import { getMyEnrollments } from "../../services/enrollment.api";
import { submitAssignment } from "../../services/assignment.api";
import { submitQuiz as submitQuizAPI } from "../../services/quiz.api";

// Convert YouTube URLs to embed format
const convertToEmbedUrl = (url) => {
    if (!url) return "";

    if (url.includes("youtube.com/embed/")) {
        return url;
    }

    if (url.includes("youtu.be/")) {
        const videoId = url
            .split("youtu.be/")[1]
            ?.split("?")[0]
            ?.split("&")[0];

        if (videoId) {
            return `https://www.youtube.com/embed/${videoId}`;
        }
    }

    if (url.includes("watch?v=")) {
        const videoId = url
            .split("watch?v=")[1]
            ?.split("&")[0];

        if (videoId) {
            return `https://www.youtube.com/embed/${videoId}`;
        }
    }

    if (url.includes("youtube.com/v/")) {
        const videoId = url
            .split("youtube.com/v/")[1]
            ?.split("?")[0]
            ?.split("&")[0];

        if (videoId) {
            return `https://www.youtube.com/embed/${videoId}`;
        }
    }

    return url;
};

// Normalize IDs returned by MongoDB
const getId = (value) => {
    if (value === null || value === undefined) return "";

    if (typeof value === "object") {
        return String(value._id || value.id || "");
    }

    return String(value);
};

// Normalize enrollment API response
const getEnrollmentList = (response) => {
    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.data?.data)) {
        return response.data.data;
    }

    return [];
};

export default function CoursePlayer() {
    const { id } = useParams();
    const dispatch = useDispatch();

    const [enrollment, setEnrollment] = useState(null);
    const [selectedModule, setSelectedModule] = useState(0);
    const [selectedLesson, setSelectedLesson] = useState(0);
    const [loading, setLoading] = useState(true);
    const [completing, setCompleting] = useState(false);
    const [completionError, setCompletionError] = useState("");

    const { currentCourse } = useSelector((state) => state.courses);

    // Find the current student's enrollment for this course
    const loadEnrollment = async () => {
        try {
            const response = await getMyEnrollments();
            const enrollments = getEnrollmentList(response);

            const userEnrollment = enrollments.find(
                (item) =>
                    getId(item.course) === String(id) ||
                    getId(item.course?._id) === String(id)
            );

            setEnrollment(userEnrollment || null);

            return userEnrollment || null;
        } catch (error) {
            console.error("Failed to load enrollment:", error);
            setEnrollment(null);
            return null;
        }
    };

    useEffect(() => {
        let active = true;

        const loadCourseAndEnrollment = async () => {
            setLoading(true);
            setCompletionError("");

            try {
                await dispatch(fetchCourseById(id)).unwrap();

                if (active) {
                    await loadEnrollment();
                }
            } catch (error) {
                console.error("Failed to load course:", error);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadCourseAndEnrollment();

        return () => {
            active = false;
        };
    }, [id, dispatch]);

    // Resolve the currently selected lesson
    const module = currentCourse?.syllabus?.[selectedModule];
    const lesson = module?.lessons?.[selectedLesson];

    // Compare lesson IDs rather than comparing objects
    const isLessonCompleted = (lessonId) => {
        const completedLessons =
            enrollment?.progress?.completedLessons || [];

        return completedLessons.some(
            (completedLesson) =>
                getId(completedLesson) === String(lessonId)
        );
    };

    // Mark the selected lesson as completed for this student
    const handleMarkComplete = async () => {
        if (completing) return;

        if (!enrollment?._id) {
            setCompletionError(
                "Your course enrollment could not be found. Please reload the page."
            );
            return;
        }

        if (!lesson?._id) {
            setCompletionError("Lesson ID could not be found.");
            return;
        }

        if (isLessonCompleted(lesson._id)) {
            return;
        }

        setCompleting(true);
        setCompletionError("");

        try {
            await dispatch(
                completeLessonAsync({
                    enrollmentId: enrollment._id,
                    lessonId: lesson._id,
                })
            ).unwrap();

            // Fetch the saved progress from the backend.
            // This avoids relying on a possibly differently shaped mutation response.
            const updatedEnrollment = await loadEnrollment();

            if (
                !updatedEnrollment ||
                !isCompletedInEnrollment(
                    updatedEnrollment,
                    lesson._id
                )
            ) {
                // The enrollment may not have been refreshed correctly.
                // Check once more and show an error if the lesson is still missing.
                const response = await getMyEnrollments();
                const enrollments = getEnrollmentList(response);

                const refreshedEnrollment = enrollments.find(
                    (item) =>
                        getId(item.course) === String(id) ||
                        getId(item.course?._id) === String(id)
                );

                if (refreshedEnrollment) {
                    setEnrollment(refreshedEnrollment);
                }

                if (
                    !refreshedEnrollment ||
                    !isCompletedInEnrollment(
                        refreshedEnrollment,
                        lesson._id
                    )
                ) {
                    setCompletionError(
                        "The lesson completion could not be confirmed. Please refresh and try again."
                    );
                }
            }

            // Refresh Redux enrollments used by the student dashboard
            await dispatch(fetchMyEnrollments());
        } catch (error) {
            console.error("Failed to mark lesson complete:", error);

            setCompletionError(
                error?.message ||
                    error?.response?.data?.message ||
                    "Failed to mark this lesson as complete. Please try again."
            );
        } finally {
            setCompleting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (!currentCourse) {
        return (
            <div className="alert alert-error">
                Course not found
            </div>
        );
    }

    return (
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                    {/* Course progress */}
                    <div className="card bg-base-100 shadow">
                        <div className="card-body p-3 sm:p-6">
                            <h2 className="card-title text-lg sm:text-xl md:text-2xl break-words">
                                {currentCourse.title}
                            </h2>

                            <div className="flex justify-between items-center mt-2">
                                <p className="text-xs sm:text-sm">
                                    Progress
                                </p>

                                <p className="text-xs sm:text-sm font-bold text-primary">
                                    {Number(enrollment?.progress?.percent) || 0}%
                                </p>
                            </div>

                            <progress
                                className="progress progress-primary w-full mt-2"
                                value={Number(enrollment?.progress?.percent) || 0}
                                max={100}
                            />
                        </div>
                    </div>

                    {/* Completion errors */}
                    {completionError && (
                        <div className="alert alert-error">
                            <span>{completionError}</span>
                        </div>
                    )}

                    {!enrollment && (
                        <div className="alert alert-warning">
                            <span>
                                No enrollment was found for this course
                                under your account.
                            </span>
                        </div>
                    )}

                    {/* Lesson video */}
                    {lesson?.videoUrl && (
                        <div className="card bg-base-100 shadow">
                            <div className="card-body p-3 sm:p-6">
                                <h3 className="card-title text-base sm:text-lg md:text-xl break-words">
                                    {lesson.title}
                                </h3>

                                <div className="bg-base-300 rounded overflow-hidden mt-2 sm:mt-4">
                                    <iframe
                                        className="w-full aspect-video"
                                        src={convertToEmbedUrl(lesson.videoUrl)}
                                        title={lesson.title}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                        frameBorder="0"
                                    />
                                </div>

                                <button
                                    onClick={handleMarkComplete}
                                    disabled={
                                        !enrollment?._id ||
                                        !lesson?._id ||
                                        completing ||
                                        isLessonCompleted(lesson._id)
                                    }
                                    className={`btn btn-sm sm:btn-md mt-3 sm:mt-4 w-full sm:w-auto ${
                                        isLessonCompleted(lesson?._id)
                                            ? "btn-disabled"
                                            : "btn-success"
                                    }`}
                                >
                                    {completing
                                        ? "Saving progress..."
                                        : isLessonCompleted(lesson?._id)
                                          ? "Completed ✓"
                                          : "✓ Mark as Complete"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Live class */}
                    {lesson?.liveClassLink && (
                        <div className="card bg-info/10 border-2 border-info shadow">
                            <div className="card-body p-3 sm:p-6">
                                <h3 className="card-title text-info">
                                    🔴 Live Class Available
                                </h3>

                                {lesson.liveClassDate && (
                                    <p className="text-sm mb-2">
                                        <strong>Scheduled:</strong>{" "}
                                        {new Date(
                                            lesson.liveClassDate
                                        ).toLocaleString()}
                                    </p>
                                )}

                                <div className="card-actions justify-end mt-3">
                                    <a
                                        href={lesson.liveClassLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-info"
                                    >
                                        Join Live Class
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Assignment */}
                    {lesson?.assignmentPrompt && (
                        <AssignmentSubmission
                            key={`${id}-${lesson._id}`}
                            courseId={id}
                            lessonId={lesson._id}
                            prompt={lesson.assignmentPrompt}
                            enrollment={enrollment}
                            onComplete={handleMarkComplete}
                        />
                    )}

                    {/* Quiz */}
                    {lesson?.quiz?.length > 0 && (
                        <QuizInterface
                            key={`${id}-${lesson._id}`}
                            quiz={lesson.quiz}
                            courseId={id}
                            lessonId={lesson._id}
                            enrollment={enrollment}
                            onComplete={handleMarkComplete}
                        />
                    )}
                </div>

                {/* Module and lesson navigation */}
                <div className="card bg-base-100 shadow h-fit lg:sticky lg:top-20 order-first lg:order-last">
                    <div className="card-body p-3 sm:p-6">
                        <h3 className="card-title text-base sm:text-lg mb-2 sm:mb-4">
                            Modules & Lessons
                        </h3>

                        <div className="space-y-2 sm:space-y-3 max-h-[40vh] sm:max-h-[50vh] lg:max-h-[70vh] overflow-y-auto">
                            {currentCourse.syllabus?.map(
                                (mod, modIdx) => (
                                    <div
                                        key={mod._id || modIdx}
                                        className="space-y-2"
                                    >
                                        <button
                                            onClick={() => {
                                                setSelectedModule(modIdx);
                                                setSelectedLesson(0);
                                                setCompletionError("");
                                            }}
                                            className={`w-full text-left font-semibold p-2 rounded transition ${
                                                selectedModule === modIdx
                                                    ? "bg-primary text-primary-content"
                                                    : "bg-base-200 hover:bg-base-300"
                                            }`}
                                        >
                                            📚 {mod.title}
                                        </button>

                                        {selectedModule === modIdx && (
                                            <div className="space-y-1 pl-4">
                                                {mod.lessons?.map(
                                                    (les, lesIdx) => {
                                                        const hasAssignment =
                                                            !!les.assignmentPrompt;
                                                        const hasQuiz =
                                                            les.quiz?.length > 0;
                                                        const hasLiveClass =
                                                            !!les.liveClassLink;
                                                        const isCompleted =
                                                            isLessonCompleted(
                                                                les._id
                                                            );

                                                        return (
                                                            <button
                                                                key={
                                                                    les._id ||
                                                                    lesIdx
                                                                }
                                                                onClick={() => {
                                                                    setSelectedLesson(
                                                                        lesIdx
                                                                    );
                                                                    setCompletionError(
                                                                        ""
                                                                    );
                                                                }}
                                                                className={`w-full text-left text-sm p-2 rounded transition flex items-center justify-between gap-2 ${
                                                                    selectedLesson ===
                                                                    lesIdx
                                                                        ? "bg-secondary text-secondary-content"
                                                                        : "hover:bg-base-200"
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-1 flex-1 min-w-0">
                                                                    {isCompleted && (
                                                                        <span className="text-success">
                                                                            ✓
                                                                        </span>
                                                                    )}

                                                                    <span className="truncate">
                                                                        {les.title}
                                                                    </span>
                                                                </span>

                                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                                    {hasLiveClass && (
                                                                        <span
                                                                            className="badge badge-xs badge-info"
                                                                            title="Has Live Class"
                                                                        >
                                                                            🔴
                                                                        </span>
                                                                    )}

                                                                    {hasAssignment && (
                                                                        <span
                                                                            className="badge badge-xs badge-secondary"
                                                                            title="Has Assignment"
                                                                        >
                                                                            📝
                                                                        </span>
                                                                    )}

                                                                    {hasQuiz && (
                                                                        <span
                                                                            className="badge badge-xs badge-primary"
                                                                            title="Has Quiz"
                                                                        >
                                                                            ❓
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Check completed status in a specific enrollment object
function isCompletedInEnrollment(enrollment, lessonId) {
    const completedLessons =
        enrollment?.progress?.completedLessons || [];

    return completedLessons.some(
        (completedLesson) =>
            getId(completedLesson) === String(lessonId)
    );
}

function AssignmentSubmission({
    courseId,
    lessonId,
    prompt,
    enrollment,
    onComplete,
}) {
    const dispatch = useDispatch();

    const [answer, setAnswer] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [previousSubmission, setPreviousSubmission] = useState(null);
    const [loadingPrevious, setLoadingPrevious] = useState(true);

    useEffect(() => {
        let active = true;

        const checkPreviousSubmission = async () => {
            setLoadingPrevious(true);

            try {
                const { getMyAssignments } = await import(
                    "../../services/assignment.api"
                );

                const response = await getMyAssignments(courseId);
                const submissions = Array.isArray(response?.data)
                    ? response.data
                    : Array.isArray(response?.data?.data)
                      ? response.data.data
                      : [];

                const previous = submissions.find(
                    (submission) =>
                        String(submission.lessonId?._id || submission.lessonId) ===
                        String(lessonId)
                );

                if (active) {
                    setPreviousSubmission(previous || null);
                    setSubmitted(!!previous);
                }
            } catch (err) {
                console.error(
                    "Failed to fetch previous assignment:",
                    err
                );
            } finally {
                if (active) setLoadingPrevious(false);
            }
        };

        checkPreviousSubmission();

        return () => {
            active = false;
        };
    }, [courseId, lessonId]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!answer.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const isLink =
                answer.trim().startsWith("http://") ||
                answer.trim().startsWith("https://");

            await submitAssignment({
                courseId,
                lessonId,
                answer: answer.trim(),
                answerType: isLink ? "link" : "text",
            });

            setSubmitted(true);

            try {
                const { getMyAssignments } = await import(
                    "../../services/assignment.api"
                );

                const response = await getMyAssignments(courseId);
                const submissions = Array.isArray(response?.data)
                    ? response.data
                    : Array.isArray(response?.data?.data)
                      ? response.data.data
                      : [];

                const updated = submissions.find(
                    (submission) =>
                        String(submission.lessonId?._id || submission.lessonId) ===
                        String(lessonId)
                );

                if (updated) setPreviousSubmission(updated);
            } catch (fetchError) {
                console.error(
                    "Failed to fetch updated assignment:",
                    fetchError
                );
            }

            if (enrollment && onComplete) {
                await onComplete();
                await dispatch(fetchMyEnrollments());
            }

            setAnswer("");
        } catch (err) {
            console.error("Failed to submit assignment:", err);

            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to submit assignment. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "reviewed":
                return (
                    <span className="badge badge-success">
                        Reviewed
                    </span>
                );
            case "pending":
                return (
                    <span className="badge badge-warning">
                        Pending Review
                    </span>
                );
            default:
                return (
                    <span className="badge badge-ghost">
                        {status || "Pending"}
                    </span>
                );
        }
    };

    if (loadingPrevious) {
        return (
            <div className="card bg-base-100 shadow">
                <div className="card-body p-3 sm:p-6">
                    <h3 className="card-title text-base sm:text-lg">
                        Assignment
                    </h3>
                    <div className="flex justify-center py-4 sm:py-8">
                        <span className="loading loading-spinner"></span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body p-3 sm:p-6">
                <h3 className="card-title text-base sm:text-lg">
                    Assignment
                </h3>

                <p className="text-xs sm:text-sm mt-2">{prompt}</p>

                {error && (
                    <div className="alert alert-error mt-4">
                        <span>{error}</span>
                    </div>
                )}

                {previousSubmission && (
                    <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-base-200 rounded-lg border border-base-300">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                            <h4 className="font-semibold text-sm sm:text-base">
                                My Submission
                            </h4>
                            <div className="flex-shrink-0">
                                {getStatusBadge(
                                    previousSubmission.status
                                )}
                            </div>
                        </div>

                        <div className="space-y-2 sm:space-y-3">
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">
                                    Your Answer:
                                </label>

                                {previousSubmission.answerType === "link" ? (
                                    <div className="mt-1">
                                        <a
                                            href={previousSubmission.answer}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="link link-primary break-all text-xs sm:text-sm"
                                        >
                                            {previousSubmission.answer}
                                        </a>
                                    </div>
                                ) : (
                                    <p className="mt-1 text-xs sm:text-sm whitespace-pre-wrap bg-base-300 p-2 sm:p-3 rounded">
                                        {previousSubmission.answer}
                                    </p>
                                )}
                            </div>

                            {previousSubmission.grade !== null &&
                                previousSubmission.grade !== undefined && (
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 uppercase">
                                            Grade:
                                        </label>
                                        <p className="text-xl sm:text-2xl font-bold text-primary mt-1">
                                            {previousSubmission.grade}%
                                        </p>
                                    </div>
                                )}

                            {previousSubmission.reviewNotes && (
                                <div>
                                    <label className="text-xs font-medium text-gray-500 uppercase">
                                        Feedback:
                                    </label>
                                    <p className="mt-1 text-xs sm:text-sm bg-base-300 p-2 sm:p-3 rounded whitespace-pre-wrap">
                                        {previousSubmission.reviewNotes}
                                    </p>
                                </div>
                            )}

                            {previousSubmission.reviewer && (
                                <div>
                                    <label className="text-xs font-medium text-gray-500 uppercase">
                                        Reviewed by:
                                    </label>
                                    <p className="text-xs sm:text-sm font-medium mt-1">
                                        {previousSubmission.reviewer?.name ||
                                            "Admin"}
                                    </p>
                                </div>
                            )}

                            <div className="text-xs text-gray-400 pt-2 border-t border-base-300">
                                Submitted:{" "}
                                {new Date(
                                    previousSubmission.createdAt
                                ).toLocaleString()}
                            </div>
                        </div>
                    </div>
                )}

                {!previousSubmission && (
                    <form
                        onSubmit={handleSubmit}
                        className="space-y-2 sm:space-y-3 mt-3 sm:mt-4"
                    >
                        <textarea
                            value={answer}
                            onChange={(event) =>
                                setAnswer(event.target.value)
                            }
                            placeholder="Enter your answer or paste Google Drive link"
                            className="textarea textarea-bordered w-full text-sm"
                            rows={4}
                            required
                            disabled={loading}
                        />

                        <button
                            type="submit"
                            disabled={loading || !answer.trim()}
                            className="btn btn-primary btn-sm sm:btn-md w-full"
                        >
                            {loading
                                ? "Submitting..."
                                : "Submit Assignment"}
                        </button>
                    </form>
                )}

                {submitted && !previousSubmission && (
                    <div className="alert alert-success mt-4">
                        <span>
                            ✓ Assignment submitted successfully!
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function QuizInterface({
    quiz,
    courseId,
    lessonId,
    enrollment,
    onComplete,
}) {
    const dispatch = useDispatch();

    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [previousSubmission, setPreviousSubmission] = useState(null);
    const [loadingPrevious, setLoadingPrevious] = useState(true);

    useEffect(() => {
        let active = true;

        const checkPreviousSubmission = async () => {
            setLoadingPrevious(true);

            try {
                const { getMyQuizSubmissions } = await import(
                    "../../services/quiz.api"
                );

                const response =
                    await getMyQuizSubmissions(courseId);

                const submissions = Array.isArray(response?.data)
                    ? response.data
                    : Array.isArray(response?.data?.data)
                      ? response.data.data
                      : [];

                const lessonSubmissions = submissions.filter(
                    (submission) =>
                        String(submission.lessonId?._id || submission.lessonId) ===
                        String(lessonId)
                );

                if (lessonSubmissions.length > 0) {
                    lessonSubmissions.sort((a, b) => {
                        const dateA = new Date(
                            a.createdAt || a.submittedAt || 0
                        );
                        const dateB = new Date(
                            b.createdAt || b.submittedAt || 0
                        );

                        return dateB - dateA;
                    });

                    const previous = lessonSubmissions[0];

                    if (active) {
                        setPreviousSubmission(previous);
                        setScore(
                            previous.percent || previous.score || 0
                        );

                        if (
                            Array.isArray(previous.answers)
                        ) {
                            const restoredAnswers = {};

                            previous.answers.forEach((answer, index) => {
                                if (
                                    answer !== undefined &&
                                    answer !== null &&
                                    answer >= 0
                                ) {
                                    restoredAnswers[index] = answer;
                                }
                            });

                            setAnswers(restoredAnswers);
                        }
                    }
                }
            } catch (err) {
                console.error(
                    "Failed to check previous quiz:",
                    err
                );
            } finally {
                if (active) setLoadingPrevious(false);
            }
        };

        checkPreviousSubmission();

        return () => {
            active = false;
        };
    }, [courseId, lessonId]);

    const handleAnswer = (questionIndex, optionIndex) => {
        if (submitted) {
            setSubmitted(false);
        }

        setAnswers((previous) => ({
            ...previous,
            [questionIndex]: optionIndex,
        }));
    };

    const handleSubmit = async () => {
        if (Object.keys(answers).length !== quiz.length) {
            setError(
                "Please answer all questions before submitting."
            );
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const answersArray = quiz.map(
                (_, index) => answers[index] ?? -1
            );

            const response = await submitQuizAPI({
                courseId,
                lessonId,
                answers: answersArray,
            });

            const result = response?.data;

            setScore(Number(result?.percent) || 0);
            setSubmitted(true);

            const submissionResult = {
                _id: result?._id,
                score: result?.score,
                total: result?.total,
                percent: result?.percent,
                lessonId,
                answers: answersArray,
                createdAt: new Date().toISOString(),
            };

            setPreviousSubmission(submissionResult);

            if (enrollment && onComplete) {
                await onComplete();
                await dispatch(fetchMyEnrollments());
            }

            console.log(
                `Quiz submitted successfully! Score: ${result?.percent}%`
            );
        } catch (err) {
            console.error("Failed to submit quiz:", err);

            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to submit quiz. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    if (loadingPrevious) {
        return (
            <div className="card bg-base-100 shadow">
                <div className="card-body p-3 sm:p-6">
                    <h3 className="card-title text-base sm:text-lg">
                        Quiz
                    </h3>
                    <div className="flex justify-center py-4 sm:py-8">
                        <span className="loading loading-spinner"></span>
                    </div>
                </div>
            </div>
        );
    }

    const displaySubmission = submitted
        ? previousSubmission
        : null;

    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <h3 className="card-title text-base sm:text-lg">
                        Quiz
                    </h3>

                    {previousSubmission && (
                        <span className="badge badge-success badge-sm sm:badge-md">
                            Previously Submitted
                        </span>
                    )}
                </div>

                {previousSubmission && !submitted && (
                    <div className="alert alert-info mt-3 sm:mt-4">
                        <div>
                            <h4 className="font-bold">
                                Previous Quiz Results
                            </h4>
                            <p className="mt-2">
                                Previous score:{" "}
                                <span className="font-bold text-primary">
                                    {previousSubmission.percent ??
                                        previousSubmission.score ??
                                        0}
                                    %
                                </span>
                            </p>
                            <p className="text-xs mt-1 text-base-content/70">
                                You can answer again and submit a new attempt.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-4 sm:space-y-6 mt-3 sm:mt-4">
                    {quiz.map((question, questionIndex) => {
                        const userAnswer = answers[questionIndex];
                        const isCorrect =
                            userAnswer === question.correctIndex;
                        const showResults = !!displaySubmission;

                        return (
                            <div
                                key={question._id || questionIndex}
                                className={`border p-3 sm:p-4 rounded ${
                                    showResults && isCorrect
                                        ? "border-success bg-success/10"
                                        : showResults && !isCorrect
                                          ? "border-error bg-error/10"
                                          : "border-base-300"
                                }`}
                            >
                                <p className="font-semibold text-sm sm:text-base mb-2 sm:mb-3">
                                    {questionIndex + 1}.{" "}
                                    {question.question}
                                </p>

                                {question.options?.map(
                                    (option, optionIndex) => (
                                        <label
                                            key={optionIndex}
                                            className="cursor-pointer flex gap-2 sm:gap-3 p-2 rounded hover:bg-base-200"
                                        >
                                            <input
                                                type="radio"
                                                name={`quiz-${lessonId}-${questionIndex}`}
                                                checked={
                                                    answers[questionIndex] ===
                                                    optionIndex
                                                }
                                                onChange={() =>
                                                    handleAnswer(
                                                        questionIndex,
                                                        optionIndex
                                                    )
                                                }
                                                disabled={loading || submitted}
                                                className="radio radio-sm flex-shrink-0"
                                            />

                                            <span className="text-xs sm:text-sm flex-1">
                                                {option}
                                            </span>

                                            {showResults &&
                                                optionIndex ===
                                                    question.correctIndex && (
                                                    <span className="text-success">
                                                        ✓ Correct
                                                    </span>
                                                )}
                                        </label>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="alert alert-error mt-4">
                        <span>{error}</span>
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={
                        loading ||
                        submitted ||
                        Object.keys(answers).length !== quiz.length
                    }
                    className="btn btn-primary btn-sm sm:btn-md mt-4 sm:mt-6 w-full"
                >
                    {loading
                        ? "Submitting..."
                        : previousSubmission
                          ? "Submit New Attempt"
                          : "Submit Quiz"}
                </button>

                {displaySubmission && (
                    <div
                        className={`alert mt-4 ${
                            score >= 70
                                ? "alert-success"
                                : score >= 50
                                  ? "alert-warning"
                                  : "alert-error"
                        }`}
                    >
                        <div>
                            <h4 className="font-bold text-lg">
                                📊 Quiz Results
                            </h4>

                            <p className="text-2xl font-bold mt-2">
                                {score}%
                            </p>

                            <p className="text-sm mt-1">
                                {displaySubmission.score ?? 0} out of{" "}
                                {displaySubmission.total ?? quiz.length}{" "}
                                correct answers
                            </p>

                            <p className="text-sm mt-2">
                                Your quiz result has been saved.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
