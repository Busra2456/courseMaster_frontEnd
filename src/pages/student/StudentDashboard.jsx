
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { fetchMyEnrollments } from "../../store/slices/enrollmentSlice";
import { getQuizStats } from "../../services/quiz.api";
import { getAssignmentStats } from "../../services/assignment.api";
import { getCourseById } from "../../services/courses.api";

const EMPTY_ARRAY = [];

function normalizeResponse(response) {
  let data = response?.data ?? response;

  for (let i = 0; i < 8; i += 1) {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) return data;

    if (Array.isArray(data.enrollments)) return data.enrollments;

    // Keep course objects intact if they already contain course fields.
    if (
      data.syllabus ||
      data.modules ||
      data.curriculum ||
      data.lessons
    ) {
      return data;
    }

    if (data.course && typeof data.course === "object") {
      data = data.course;
      continue;
    }

    if (data.data !== undefined) {
      data = data.data;
      continue;
    }

    return data;
  }

  return data;
}

function getCourseId(enrollment) {
  const course = enrollment?.course;

  const id =
    course && typeof course === "object"
      ? course._id || course.id
      : course;

  return id ? String(id) : null;
}

function getCompletedLessons(enrollment) {
  const lessons = enrollment?.progress?.completedLessons;

  if (!Array.isArray(lessons)) return [];

  const ids = lessons
    .map((lesson) => {
      if (typeof lesson === "string" || typeof lesson === "number") {
        return String(lesson);
      }

      if (lesson && typeof lesson === "object") {
        const id = lesson._id || lesson.id;
        return id ? String(id) : null;
      }

      return null;
    })
    .filter(Boolean);

  return [...new Set(ids)];
}

function getCourseModules(courseData) {
  if (!courseData || typeof courseData !== "object") return [];

  const candidates = [
    courseData.syllabus,
    courseData.modules,
    courseData.curriculum,
    courseData.sections,
    courseData.course?.syllabus,
    courseData.course?.modules,
    courseData.course?.curriculum,
  ];

  return candidates.find(Array.isArray) || [];
}

function getModuleLessons(module) {
  if (Array.isArray(module)) return module;
  if (!module || typeof module !== "object") return [];

  const candidates = [
    module.lessons,
    module.lectures,
    module.contents,
    module.topics,
  ];

  return candidates.find(Array.isArray) || [];
}

function getAllLessons(courseData) {
  const modules = getCourseModules(courseData);

  // Some APIs return a flat lesson array instead of modules.
  if (
    modules.length === 0 &&
    Array.isArray(courseData?.lessons)
  ) {
    return courseData.lessons;
  }

  return modules.flatMap((module) => {
    const lessons = getModuleLessons(module);

    // Handle a lesson object stored directly in the module list.
    if (
      lessons.length === 0 &&
      module &&
      typeof module === "object" &&
      (module._id || module.id) &&
      (module.title || module.name)
    ) {
      return [module];
    }

    return lessons;
  });
}

function getTotalLessons(courseData) {
  return getAllLessons(courseData).length;
}
function getProgress(enrollment, courseData) {
  const allLessons = getAllLessons(courseData);
  const totalLessons = allLessons.length;

  const completedLessonIds = new Set(
    getCompletedLessons(enrollment)
  );

  const validCompletedCount = allLessons.filter((lesson) => {
    const lessonId = lesson?._id || lesson?.id;

    return lessonId && completedLessonIds.has(String(lessonId));
  }).length;

  if (totalLessons > 0) {
    return {
      completedCount: validCompletedCount,
      totalLessons,
      percent: Math.round(
        (validCompletedCount / totalLessons) * 100
      ),
    };
  }

  const backendPercent = Number(enrollment?.progress?.percent);

  return {
    completedCount: validCompletedCount,
    totalLessons: 0,
    percent: Number.isFinite(backendPercent)
      ? Math.min(100, Math.max(0, Math.round(backendPercent)))
      : 0,
  };
}


function createLessonMap(courseData) {
  const map = {};

  getAllLessons(courseData).forEach((lesson) => {
    if (!lesson || typeof lesson !== "object") return;

    const id = lesson._id || lesson.id;

    if (id) {
      map[String(id)] = lesson.title || lesson.name || "Lesson";
    }
  });

  return map;
}

function getStatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function getLessonTitle(courseId, lessonId, courseStats) {
  if (!lessonId) return "Lesson";

  const lessonMap = courseStats?.[courseId]?.lessonMap;

  return lessonMap?.[String(lessonId)] || "Lesson";
}

export default function StudentDashboard() {
  const dispatch = useDispatch();

  const enrollmentState = useSelector(
    (state) => state.enrollment || {}
  );

  const enrollments = Array.isArray(enrollmentState.enrollments)
    ? enrollmentState.enrollments
    : EMPTY_ARRAY;

  const loading = Boolean(enrollmentState.loading);
  const error = enrollmentState.error || null;

  const currentCourse = useSelector(
    (state) => state.courses?.currentCourse || null
  );

  const [expandedCourse, setExpandedCourse] = useState(null);
  const [courseStats, setCourseStats] = useState({});
  const [loadingStats, setLoadingStats] = useState({});
  const [statsErrors, setStatsErrors] = useState({});

  const requestIds = useRef({});

  useEffect(() => {
    dispatch(fetchMyEnrollments());
  }, [dispatch]);

  /* -------------------- Load Course Statistics -------------------- */

  const loadCourseStats = useCallback(
    async (courseId, forceRefresh = false) => {
      if (!courseId) return;

      if (loadingStats[courseId]) return;

      if (courseStats[courseId] && !forceRefresh) return;

      const requestId =
        (requestIds.current[courseId] || 0) + 1;

      requestIds.current[courseId] = requestId;

      setLoadingStats((previous) => ({
        ...previous,
        [courseId]: true,
      }));

      setStatsErrors((previous) => ({
        ...previous,
        [courseId]: null,
      }));

      try {
        let courseData = null;

        try {
          if (
            currentCourse &&
            String(currentCourse._id || currentCourse.id) ===
              String(courseId)
          ) {
            courseData = normalizeResponse(currentCourse);
          } else {
            const response = await getCourseById(courseId);

            console.log("COURSE API RESPONSE:", response);

            courseData = normalizeResponse(response);
          }

          // Handle an additional nested course object.
          if (
            courseData &&
            !Array.isArray(courseData) &&
            courseData.course &&
            typeof courseData.course === "object"
          ) {
            courseData = courseData.course;
          }

          console.log("NORMALIZED COURSE DATA:", courseData);
          console.log("COURSE SYLLABUS:", courseData?.syllabus);
          console.log("COURSE MODULES:", getCourseModules(courseData));
          console.log("TOTAL LESSONS:", getTotalLessons(courseData));
        } catch (courseError) {
          console.error("Failed to fetch course:", courseError);
        }

        const [quizResult, assignmentResult] =
          await Promise.allSettled([
            getQuizStats(courseId),
            getAssignmentStats(courseId),
          ]);

        // Ignore stale responses if a newer request was started.
        if (requestIds.current[courseId] !== requestId) return;

        const quizData =
          quizResult.status === "fulfilled"
            ? normalizeResponse(quizResult.value)
            : {};

        const assignmentData =
          assignmentResult.status === "fulfilled"
            ? normalizeResponse(assignmentResult.value)
            : {};

        if (quizResult.status === "rejected") {
          console.error("Quiz stats error:", quizResult.reason);
        }

        if (assignmentResult.status === "rejected") {
          console.error(
            "Assignment stats error:",
            assignmentResult.reason
          );
        }

        setCourseStats((previous) => ({
          ...previous,
          [courseId]: {
            courseData,
            lessonMap: createLessonMap(courseData),
            quizStats: quizData || {},
            assignmentStats: assignmentData || {},
          },
        }));

        if (
          !courseData &&
          quizResult.status === "rejected" &&
          assignmentResult.status === "rejected"
        ) {
          setStatsErrors((previous) => ({
            ...previous,
            [courseId]:
              "Could not load course details or statistics.",
          }));
        }
      } catch (statsError) {
        console.error(
          "Failed to load course statistics:",
          statsError
        );

        if (requestIds.current[courseId] === requestId) {
          setStatsErrors((previous) => ({
            ...previous,
            [courseId]: getErrorMessage(
              statsError,
              "Failed to load course statistics."
            ),
          }));
        }
      } finally {
        if (requestIds.current[courseId] === requestId) {
          setLoadingStats((previous) => ({
            ...previous,
            [courseId]: false,
          }));
        }
      }
    },
    [courseStats, currentCourse, loadingStats]
  );

  /* -------------------- Expand / Refresh -------------------- */

  const handleExpandCourse = (courseId) => {
    if (!courseId) return;

    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      return;
    }

    setExpandedCourse(courseId);
    loadCourseStats(courseId);
  };

  const handleRefreshStats = (courseId) => {
    if (!courseId || loadingStats[courseId]) return;

    setCourseStats((previous) => {
      const updated = { ...previous };
      delete updated[courseId];
      return updated;
    });

    loadCourseStats(courseId, true);
  };

  /* -------------------- Loading State -------------------- */

  if (loading && enrollments.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  /* -------------------- Dashboard UI -------------------- */

  return (
    <div className="container mx-auto space-y-4 px-4 py-4 lg:space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold sm:text-3xl">
          My Courses
        </h1>

        <Link
          to="/courses"
          className="btn btn-outline btn-sm w-full sm:btn-md sm:w-auto"
        >
          Browse More Courses
        </Link>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => dispatch(fetchMyEnrollments())}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && enrollments.length === 0 ? (
        <div className="card bg-base-200">
          <div className="card-body py-12 text-center">
            <h2 className="card-title justify-center">
              No courses enrolled yet
            </h2>

            <p className="text-base-content/70">
              Start your learning journey by enrolling in a course.
            </p>

            <Link
              to="/courses"
              className="btn btn-primary mx-auto mt-4 w-fit"
            >
              Browse Courses
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {enrollments.map((enrollment) => {
            const courseId = getCourseId(enrollment);
            const courseKey = courseId || enrollment._id;
            const isExpanded = expandedCourse === courseId;

            const stats = courseId
              ? courseStats[courseId]
              : null;

            const isLoading = courseId
              ? Boolean(loadingStats[courseId])
              : false;

            const populatedCourse =
              enrollment.course &&
              typeof enrollment.course === "object" &&
              !Array.isArray(enrollment.course)
                ? enrollment.course
                : null;

            const courseData =
              stats?.courseData || populatedCourse;

            const progress = getProgress(enrollment, courseData);

            const quizStats = stats?.quizStats || {};
            const assignmentStats = stats?.assignmentStats || {};

            const quizSubmissions = Array.isArray(
              quizStats.submissions
            )
              ? quizStats.submissions
              : [];

            const assignmentSubmissions = Array.isArray(
              assignmentStats.submissions
            )
              ? assignmentStats.submissions
              : [];

            const quizAverage = getStatNumber(quizStats.average);

            const assignmentAverage = getStatNumber(
              assignmentStats.average
            );

            const quizCount = getStatNumber(
              quizStats.totalQuizzes
            );

            const assignmentCount = getStatNumber(
              assignmentStats.totalAssignments
            );

            const reviewedCount = getStatNumber(
              assignmentStats.reviewedCount
            );

            const overallCount = quizCount + reviewedCount;

            const overallGrade =
              overallCount > 0
                ? Math.round(
                    (quizAverage * quizCount +
                      assignmentAverage * reviewedCount) /
                      overallCount
                  )
                : null;

            return (
              <div
                key={courseKey}
                className="card border border-base-300 bg-base-100 shadow-md"
              >
                <div className="card-body p-4 sm:p-6">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <h2 className="card-title break-words text-lg sm:text-xl">
                        {enrollment.course?.title || "Course"}
                      </h2>

                      <p className="mt-1 text-xs text-base-content/70 sm:text-sm">
                        Instructor:{" "}
                        {enrollment.course?.instructorName ||
                          "Not specified"}
                      </p>
                    </div>

                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleExpandCourse(courseId)}
                        disabled={!courseId}
                        className="btn btn-outline btn-sm flex-1 sm:flex-none"
                      >
                        {isExpanded ? "Hide Details" : "Details"}
                      </button>

                      {courseId ? (
                        <Link
                          to={`/courses/${courseId}/player`}
                          className="btn btn-primary btn-sm flex-1 sm:flex-none"
                        >
                          Continue
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm flex-1 sm:flex-none"
                          disabled
                        >
                          Continue
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Course Progress */}

                  <div className="mt-4 rounded-lg bg-base-200 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-base-content/80">
                          Course Progress
                        </p>

                        {progress.totalLessons > 0 ? (
                          <p className="mt-1 text-xs text-base-content/70">
                            {progress.completedCount} of{" "}
                            {progress.totalLessons} lessons completed
                          </p>
                        ) : progress.completedCount > 0 ? (
                          <p className="mt-1 text-xs text-base-content/70">
                            {progress.completedCount} lesson
                            {progress.completedCount !== 1
                              ? "s"
                              : ""}{" "}
                            completed
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-base-content/70">
                            {courseData
                              ? "No lessons found in course syllabus."
                              : "Lesson details are not available yet."}
                          </p>
                        )}
                      </div>

                      <p className="text-right text-2xl font-bold text-primary sm:text-3xl">
                        {progress.percent}%
                      </p>
                    </div>

                    <progress
                      className="progress progress-primary h-4 w-full"
                      value={progress.percent}
                      max={100}
                    />

                    {isExpanded && stats && (
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-base-300 pt-3 text-xs text-base-content/60">
                        <span>📚 Course Content</span>

                        <div className="flex flex-wrap gap-3">
                          {quizCount > 0 && (
                            <span>
                              ❓ {quizCount} Quiz
                              {quizCount !== 1 ? "zes" : ""}
                            </span>
                          )}

                          {assignmentCount > 0 && (
                            <span>
                              📝 {assignmentCount} Assignment
                              {assignmentCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}

                  {isExpanded && (
                    <div className="mt-6 space-y-4 border-t border-base-300 pt-4">
                      {isLoading ? (
                        <div className="flex justify-center py-8">
                          <span className="loading loading-spinner" />
                        </div>
                      ) : statsErrors[courseId] ? (
                        <div className="alert alert-error">
                          <span>{statsErrors[courseId]}</span>

                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              handleRefreshStats(courseId)
                            }
                          >
                            Retry
                          </button>
                        </div>
                      ) : stats ? (
                        <>
                          <div className="mb-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleRefreshStats(courseId)
                              }
                              disabled={isLoading}
                              className="btn btn-circle btn-outline btn-sm"
                              title="Refresh Stats"
                              aria-label="Refresh course statistics"
                            >
                              🔄
                            </button>
                          </div>

                          {/* Grade Cards */}

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                            <div className="card bg-primary text-primary-content">
                              <div className="card-body p-3 sm:p-4">
                                <h3 className="text-sm font-semibold opacity-80">
                                  Quiz Average
                                </h3>
                                <p className="text-3xl font-bold">
                                  {quizAverage}%
                                </p>
                                <p className="text-xs opacity-70">
                                  {quizCount} quiz
                                  {quizCount !== 1 ? "zes" : ""} taken
                                </p>
                              </div>
                            </div>

                            <div className="card bg-secondary text-secondary-content">
                              <div className="card-body p-3 sm:p-4">
                                <h3 className="text-sm font-semibold opacity-80">
                                  Assignment Average
                                </h3>
                                <p className="text-3xl font-bold">
                                  {assignmentAverage}%
                                </p>
                                <p className="text-xs opacity-70">
                                  {reviewedCount} of{" "}
                                  {assignmentCount} reviewed
                                </p>
                              </div>
                            </div>

                            <div className="card bg-accent text-accent-content">
                              <div className="card-body p-3 sm:p-4">
                                <h3 className="text-sm font-semibold opacity-80">
                                  Overall Grade
                                </h3>
                                <p className="text-3xl font-bold">
                                  {overallGrade === null
                                    ? "N/A"
                                    : `${overallGrade}%`}
                                </p>
                                <p className="text-xs opacity-70">
                                  Weighted average
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Quiz Submissions */}

                          {quizSubmissions.length > 0 ? (
                            <div className="card bg-base-200">
                              <div className="card-body p-4">
                                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <h3 className="card-title text-base sm:text-lg">
                                    📝 Quiz Marks
                                  </h3>

                                  <span className="badge badge-primary">
                                    {quizSubmissions.length} Quiz
                                    {quizSubmissions.length !== 1
                                      ? "zes"
                                      : ""}
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {quizSubmissions.map(
                                    (quiz, index) => {
                                      const percent = getStatNumber(
                                        quiz.percent
                                      );

                                      const submittedDate =
                                        quiz.submittedAt
                                          ? new Date(quiz.submittedAt)
                                          : null;

                                      return (
                                        <div
                                          key={quiz._id || index}
                                          className="flex flex-col justify-between gap-2 rounded-lg bg-base-100 p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="break-words font-semibold">
                                              {getLessonTitle(
                                                courseId,
                                                quiz.lessonId,
                                                courseStats
                                              )}
                                            </p>

                                            <p className="mt-1 text-sm text-base-content/70">
                                              {quiz.score ?? 0} out of{" "}
                                              {quiz.total ?? 0} questions
                                              correct
                                            </p>

                                            {submittedDate &&
                                              !Number.isNaN(
                                                submittedDate.getTime()
                                              ) && (
                                                <p className="mt-1 text-xs text-base-content/50">
                                                  📅 Submitted:{" "}
                                                  {submittedDate.toLocaleDateString()}{" "}
                                                  at{" "}
                                                  {submittedDate.toLocaleTimeString()}
                                                </p>
                                              )}
                                          </div>

                                          <div className="sm:text-right">
                                            <p
                                              className={`text-3xl font-bold ${
                                                percent >= 70
                                                  ? "text-success"
                                                  : percent >= 50
                                                    ? "text-warning"
                                                    : "text-error"
                                              }`}
                                            >
                                              {percent}%
                                            </p>

                                            <p className="mt-1 text-xs text-base-content/60">
                                              {percent >= 70
                                                ? "Excellent!"
                                                : percent >= 50
                                                  ? "Good!"
                                                  : "Keep practicing!"}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="alert alert-info">
                              <span>
                                📝 No quiz submissions yet. Complete quizzes
                                in the course to see your marks here.
                              </span>
                            </div>
                          )}

                          {/* Assignment Submissions */}

                          {assignmentSubmissions.length > 0 ? (
                            <div className="card bg-base-200">
                              <div className="card-body p-4">
                                <h3 className="card-title mb-4 text-base sm:text-lg">
                                  📄 Assignment Marks
                                </h3>

                                <div className="space-y-3">
                                  {assignmentSubmissions.map(
                                    (assignment, index) => {
                                      const submittedDate =
                                        assignment.submittedAt
                                          ? new Date(
                                              assignment.submittedAt
                                            )
                                          : null;

                                      const reviewedDate =
                                        assignment.reviewedAt
                                          ? new Date(
                                              assignment.reviewedAt
                                            )
                                          : null;

                                      const hasValidSubmittedDate =
                                        submittedDate &&
                                        !Number.isNaN(
                                          submittedDate.getTime()
                                        );

                                      const hasValidReviewedDate =
                                        reviewedDate &&
                                        !Number.isNaN(
                                          reviewedDate.getTime()
                                        );

                                      return (
                                        <div
                                          key={assignment._id || index}
                                          className="card bg-base-100"
                                        >
                                          <div className="card-body p-3 sm:p-4">
                                            <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                              <div className="min-w-0 flex-1">
                                                <p className="break-words font-semibold">
                                                  {getLessonTitle(
                                                    courseId,
                                                    assignment.lessonId,
                                                    courseStats
                                                  )}
                                                </p>

                                                {hasValidSubmittedDate && (
                                                  <p className="mt-1 text-sm text-base-content/70">
                                                    Submitted:{" "}
                                                    {submittedDate.toLocaleDateString()}
                                                  </p>
                                                )}

                                                {assignment.status ===
                                                  "reviewed" &&
                                                  hasValidReviewedDate && (
                                                    <p className="text-sm text-base-content/70">
                                                      Reviewed:{" "}
                                                      {reviewedDate.toLocaleDateString()}
                                                    </p>
                                                  )}
                                              </div>

                                              <div className="sm:text-right">
                                                <span
                                                  className={`badge badge-sm ${
                                                    assignment.status ===
                                                    "reviewed"
                                                      ? "badge-success"
                                                      : "badge-warning"
                                                  }`}
                                                >
                                                  {assignment.status ===
                                                  "reviewed"
                                                    ? "Reviewed"
                                                    : "Pending"}
                                                </span>

                                                {assignment.grade !== null &&
                                                  assignment.grade !==
                                                    undefined && (
                                                    <p
                                                      className={`mt-2 text-2xl font-bold ${
                                                        getStatNumber(
                                                          assignment.grade
                                                        ) >= 70
                                                          ? "text-success"
                                                          : getStatNumber(
                                                                assignment.grade
                                                              ) >= 50
                                                            ? "text-warning"
                                                            : "text-error"
                                                      }`}
                                                    >
                                                      {getStatNumber(
                                                        assignment.grade
                                                      )}
                                                      %
                                                    </p>
                                                  )}
                                              </div>
                                            </div>

                                            <div className="mt-2">
                                              <p className="text-sm font-semibold">
                                                Submission:
                                              </p>

                                              {assignment.answerType ===
                                              "link" ? (
                                                <a
                                                  href={assignment.answer}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="break-all text-sm text-primary hover:underline"
                                                >
                                                  {assignment.answer}
                                                </a>
                                              ) : (
                                                <p className="mt-1 rounded bg-base-200 p-2 text-sm text-base-content/80">
                                                  {assignment.answer ||
                                                    "No answer provided"}
                                                </p>
                                              )}
                                            </div>

                                            {assignment.reviewNotes && (
                                              <div className="mt-3 rounded border border-info/20 bg-info/10 p-3">
                                                <p className="mb-1 text-sm font-semibold text-info">
                                                  📝 Feedback from{" "}
                                                  {assignment.reviewer?.name ||
                                                    "Admin"}
                                                  :
                                                </p>

                                                <p className="text-sm">
                                                  {assignment.reviewNotes}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="alert alert-info">
                              <span>
                                No assignment submissions yet. Submit
                                assignments in the course to see your marks
                                and feedback here.
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-4 text-center text-base-content/70">
                          Course statistics are not loaded yet.

                          <button
                            type="button"
                            className="btn btn-sm btn-outline ml-2"
                            onClick={() =>
                              loadCourseStats(courseId, true)
                            }
                          >
                            Load Again
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
