    # Lecture Scheduling — Frontend Error Handling Guide

    All lecture scheduling errors from `POST /institute-lectures` and `PATCH /institute-lectures/:id/reschedule`
    return structured JSON with a **human-readable `message`** and an **`actionHint`** that tells the user exactly what to do.

    ---

    ## Standard Error Response Shape

    ```json
    {
    "success": false,
    "statusCode": 400,
    "message": "Start time is in the past",
    "error": "HttpException",
    "requestId": "req_1773167154040_ofHB4mbZ",
    "timestamp": "2026-03-10T23:55:54.000Z",
    "path": "/institute-lectures",
    "details": {
        "message": "Start time is in the past",
        "actionHint": "The start time you selected (Mar 10, 2026 at 06:25 AM UTC) has already passed — the current server time is Mar 10, 2026 at 11:55 PM UTC. Please choose a future date and time. If the date looks correct on your device, check that your device clock is accurate.",
        "submittedStartTime": "2026-03-10T06:25:00.000Z",
        "serverTime": "2026-03-10T23:55:54.000Z",
        "field": "startTime",
        "statusCode": 400,
        "error": "Bad Request"
    }
    }
    ```

    **Always use `details.actionHint` as the primary user-facing error message.**
    Fall back to `message` if `details` is absent.

    ---

    ## All Possible Validation Errors

    ### 1. Start time is in the past

    | Field | Value |
    |-------|-------|
    | `message` | `"Start time is in the past"` |
    | `details.field` | `"startTime"` |
    | `details.actionHint` | e.g. `"The start time you selected (Mar 10, 2026 at 06:25 AM UTC) has already passed — the current server time is Mar 10, 2026 at 11:55 PM UTC. Please choose a future date and time..."` |
    | `details.submittedStartTime` | ISO string of what was sent |
    | `details.serverTime` | ISO string of server's current UTC time |

    **This only triggers on `POST` (create), not on reschedule.**

    **UI Recommendation:** Highlight the start-time field in red and show `details.actionHint` beneath it. If the user is in a different timezone, remind them that the picker should reflect their local time (see the timezone section below).

    ---

    ### 2. End time is not after start time

    | Field | Value |
    |-------|-------|
    | `message` | `"End time must be after start time"` |
    | `details.field` | `"endTime"` |
    | `details.actionHint` | e.g. `"Your end time (Mar 10, 2026 at 06:25 AM UTC) is not after your start time (Mar 10, 2026 at 08:25 AM UTC)..."` |

    **UI Recommendation:** Highlight the end-time field and show the hint. Disable the submit button if `endTime ≤ startTime` while the user is still picking.

    ---

    ### 3. Lecture duration too long (> 24 hours)

    | Field | Value |
    |-------|-------|
    | `message` | `"Lecture duration is too long"` |
    | `details.durationHours` | Calculated duration (e.g. `26.5`) |
    | `details.maxDurationHours` | `24` |
    | `details.actionHint` | e.g. `"Your lecture is currently set to run for 26.5 hours, which exceeds the 24-hour maximum. Please shorten the end time."` |

    ---

    ### 4. Lecture duration too short (< 5 minutes)

    | Field | Value |
    |-------|-------|
    | `message` | `"Lecture duration is too short"` |
    | `details.durationMinutes` | Calculated duration (e.g. `3`) |
    | `details.minDurationMinutes` | `5` |
    | `details.actionHint` | e.g. `"Your lecture is only 3 minute(s) long. Please set the end time so the lecture lasts at least 5 minutes."` |

    ---

    ### 5. Invalid start time format

    | Field | Value |
    |-------|-------|
    | `message` | `"Invalid start time"` |
    | `details.field` | `"startTime"` |
    | `details.actionHint` | `"The start time could not be understood. Please send a valid ISO 8601 date string, e.g. \"2026-03-15T09:00:00.000Z\"."` |

    ---

    ### 6. Invalid end time format

    | Field | Value |
    |-------|-------|
    | `message` | `"Invalid end time"` |
    | `details.field` | `"endTime"` |
    | `details.actionHint` | `"The end time could not be understood. Please send a valid ISO 8601 date string, e.g. \"2026-03-15T11:00:00.000Z\"."` |

    ---

    ## Recommended Frontend Error Handler

    ```typescript
    interface LectureApiError {
    success: false;
    statusCode: number;
    message: string;
    details?: {
        actionHint?: string;
        field?: string;
        submittedStartTime?: string;
        serverTime?: string;
        durationHours?: number;
        durationMinutes?: number;
        maxDurationHours?: number;
        minDurationMinutes?: number;
    };
    }

    function handleLectureError(error: LectureApiError): void {
    const userMessage = error.details?.actionHint ?? error.message;
    const field = error.details?.field;

    if (field) {
        // Highlight the specific form field
        showFieldError(field, userMessage);
    } else {
        // Show as a general toast / alert
        showToast('error', userMessage);
    }
    }
    ```

    ### Example React/Next.js usage

    ```tsx
    try {
    await createLecture(payload);
    } catch (err: any) {
    const body: LectureApiError = await err.response.json();
    const userMessage = body.details?.actionHint ?? body.message;

    // Show the message directly — it is already human-readable
    setError(body.details?.field ?? 'general', { message: userMessage });
    }
    ```

    ---

    ## Timezone — Common Source of Confusion

    The server validates all times in **UTC**. If a user's browser is in a non-UTC timezone, a date-time picker that sends **local time** without a timezone suffix (e.g. `"2026-03-10T06:25:00"`) will be interpreted as UTC, making it appear to be in the past.

    **Fix:** Always convert to UTC before sending:

    ```typescript
    // ✅ Correct — always pass a UTC ISO string
    const startTimeUTC = selectedDate.toISOString(); // e.g. "2026-03-10T06:25:00.000Z"

    // ❌ Wrong — local time string without timezone offset
    const startTimeLocal = "2026-03-10T11:55:00"; // no "Z", treated as UTC by server
    ```

    **If you use a date-time picker library** (e.g. `date-fns`, `dayjs`, `moment`):

    ```typescript
    import dayjs from 'dayjs';
    import utc from 'dayjs/plugin/utc';
    dayjs.extend(utc);

    // Convert the picker value (local) → UTC ISO string
    const startTimeUTC = dayjs(pickerValue).utc().toISOString();
    ```

    The `details.serverTime` and `details.submittedStartTime` fields returned in the error response
    are both UTC ISO strings — you can show these to the user or use them to compute the offset for a
    helpful debug message.

    ---

    ## Quick Reference — Error Messages by Code

    | `message` value | Likely cause | `details.field` |
    |-----------------|--------------|-----------------|
    | `Start time is in the past` | Selected time already passed (check timezone) | `startTime` |
    | `End time must be after start time` | End ≤ start | `endTime` |
    | `Lecture duration is too long` | Duration > 24 h | — |
    | `Lecture duration is too short` | Duration < 5 min | — |
    | `Invalid start time` | Unparseable date string | `startTime` |
    | `Invalid end time` | Unparseable date string | `endTime` |
