
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  enrollInCourse,
  getMyEnrollments,
  completeLesson,
} from "../../services/enrollment.api";

// Normalize enrollment response from the backend.
const getEnrollment = (payload) => payload?.data ?? payload;

// Normalize enrollment list response from the backend.
const getEnrollmentList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.enrollments)) {
    return payload.enrollments;
  }

  if (Array.isArray(payload?.data?.enrollments)) {
    return payload.data.enrollments;
  }

  return [];
};

// Enroll in a course.
export const enrollCourseAsync = createAsyncThunk(
  "enrollment/enrollCourse",
  async ({ courseId, batchId }, { rejectWithValue }) => {
    try {
      const res = await enrollInCourse(courseId, batchId);
      return res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to enroll"
      );
    }
  }
);

// Fetch the logged-in student's enrollments.
export const fetchMyEnrollments = createAsyncThunk(
  "enrollment/fetchMyEnrollments",
  async (_, { rejectWithValue }) => {
    try {
      const res = await getMyEnrollments();
      return getEnrollmentList(res.data);
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load enrollments"
      );
    }
  }
);

// Mark a lesson as completed.
export const completeLessonAsync = createAsyncThunk(
  "enrollment/completeLesson",
  async ({ enrollmentId, lessonId }, { rejectWithValue }) => {
    try {
      const res = await completeLesson(enrollmentId, lessonId);
      return res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to complete lesson"
      );
    }
  }
);

const initialState = {
  enrollments: [],
  loading: false,
  enrolling: false,
  completingLesson: false,
  error: null,
  success: null,
};

const enrollmentSlice = createSlice({
  name: "enrollment",
  initialState,

  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    clearSuccess: (state) => {
      state.success = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // Enroll in a course
      .addCase(enrollCourseAsync.pending, (state) => {
        state.enrolling = true;
        state.error = null;
        state.success = null;
      })

      .addCase(enrollCourseAsync.fulfilled, (state, action) => {
        state.enrolling = false;
        state.success = "Successfully enrolled!";

        const enrollment = getEnrollment(action.payload);

        if (!enrollment?._id) return;

        const exists = state.enrollments.some(
          (item) => item._id === enrollment._id
        );

        if (!exists) {
          state.enrollments.unshift(enrollment);
        }
      })

      .addCase(enrollCourseAsync.rejected, (state, action) => {
        state.enrolling = false;
        state.error = action.payload || "Failed to enroll";
      })

      // Fetch student's enrollments
      .addCase(fetchMyEnrollments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchMyEnrollments.fulfilled, (state, action) => {
        state.loading = false;
        state.enrollments = getEnrollmentList(action.payload);
      })

      .addCase(fetchMyEnrollments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Failed to load enrollments";
      })

      // Complete a lesson
      .addCase(completeLessonAsync.pending, (state) => {
        state.completingLesson = true;
        state.error = null;
        state.success = null;
      })

      .addCase(completeLessonAsync.fulfilled, (state, action) => {
        state.completingLesson = false;
        state.success = "Lesson marked complete!";

        const updated = getEnrollment(action.payload);

        if (!updated?._id) return;

        const index = state.enrollments.findIndex(
          (item) => item._id === updated._id
        );

        if (index !== -1) {
          state.enrollments[index] = {
            ...state.enrollments[index],
            ...updated,
          };
        } else {
          state.enrollments.push(updated);
        }
      })

      .addCase(completeLessonAsync.rejected, (state, action) => {
        state.completingLesson = false;
        state.error = action.payload || "Failed to complete lesson";
      });
  },
});

export const { clearError, clearSuccess } = enrollmentSlice.actions;

export default enrollmentSlice.reducer;
