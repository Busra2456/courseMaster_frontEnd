
import { Link } from "react-router-dom";
import { BookOpen, ArrowRight, Star } from "lucide-react";

export default function CourseCard({ course }) {
    const totalLessons =
        course.syllabus?.reduce(
            (acc, mod) => acc + (mod.lessons?.length || 0),
            0
        ) || 0;

    const instructorName = course.instructorName || "Instructor";
    const instructorInitial = instructorName.charAt(0).toUpperCase();

    return (
        <div className="card bg-base-100/90 backdrop-blur border border-base-300 shadow-lg hover:shadow-2xl hover:border-primary/40 transition-all duration-300 group rounded-3xl overflow-hidden flex flex-col h-full hover:-translate-y-1">
            {/* Visual Top Header Banner */}
            <div className="h-32 bg-gradient-to-r from-[#78A083]/30 via-[#50727B]/30 to-[#344955]/40 p-4 relative flex flex-col justify-between overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-primary/20 rounded-full blur-xl pointer-events-none" />

                <div className="flex justify-between items-start relative z-10">
                    {course.category ? (
                        <span className="badge bg-base-100/90 backdrop-blur text-primary border-primary/30 font-bold px-3 py-1 shadow-sm text-xs">
                            {course.category}
                        </span>
                    ) : (
                        <span />
                    )}

                    <div className="flex items-center gap-1 bg-base-100/90 backdrop-blur px-2.5 py-0.5 rounded-full text-xs font-extrabold text-amber-500 shadow-sm">
                        <Star className="w-3.5 h-3.5 fill-amber-500" />
                        <span>4.9</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-base-content/80 relative z-10">
                    <BookOpen className="w-4 h-4 text-primary" />

                    <span>
                        {course.syllabus?.length || 0} Modules
                    </span>

                    {totalLessons > 0 && (
                        <span>• {totalLessons} Lessons</span>
                    )}
                </div>
            </div>

            {/* Course Information */}
            <div className="card-body p-5 flex flex-col flex-1 justify-between space-y-4">
                <div>
                    <h2 className="card-title text-lg sm:text-xl font-bold leading-snug group-hover:text-primary transition-colors">
                        {course.title || "Untitled Course"}
                    </h2>

                    {/* Instructor: use div instead of p because it contains a div */}
                    <div className="text-sm text-base-content/70 mt-3 flex items-center gap-2">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                            {instructorInitial}
                        </div>

                        <span className="font-semibold text-xs text-base-content/80">
                            By {instructorName}
                        </span>
                    </div>
                </div>

                {/* Course Tags */}
                {Array.isArray(course.tags) && course.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {course.tags.slice(0, 3).map((tag, index) => (
                            <span
                                key={`${tag}-${index}`}
                                className="badge badge-sm badge-ghost text-xs font-medium border-base-300"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Course Fee and Details */}
                <div className="pt-4 border-t border-base-300 flex items-center justify-between gap-3 mt-auto">
                    <div>
                        <span className="text-xs text-base-content/60 font-medium">
                            Course Fee
                        </span>

                        <p className="font-black text-xl gradient-text">
                            ৳{" "}
                            {typeof course.price === "number"
                                ? course.price.toLocaleString("en-BD")
                                : "N/A"}
                        </p>
                    </div>

                    <Link
                        to={`/courses/${course._id}`}
                        className="btn btn-primary btn-sm px-4 shadow-md hover:shadow-lg font-bold gap-1 group-hover:bg-secondary"
                    >
                        Details
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
