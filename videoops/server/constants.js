export const STATUSES = ['New Brief Received', 'Pending Assignment', 'Assigned', 'In Progress', 'Review', 'Changes Required', 'Completed', 'On Hold'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const PRIORITY_RANK = { Low: 1, Medium: 2, High: 3, Urgent: 4 };
export const PRIORITY_WEIGHT = { Low: 0.75, Medium: 1, High: 1.5, Urgent: 2 };
export const PROJECT_TYPES = ['AI Video Production', 'Performance Ad', 'Product Video', 'UGC-Style Ad', 'Social Reel', 'Motion Graphics', 'Brand Film', 'Explainer'];
export const ASSIGN_MODES = ['auto', 'sheet', 'manual', 'self', 'locked'];
export const ASSIGN_MODE_LABEL = {
  auto: 'Auto-assigned', sheet: 'From Google Sheet', manual: 'Manually assigned', self: 'Assigned to me', locked: 'Do not auto-assign',
};
export const CLOSED_STATUSES = ['Completed'];

// Notification catalogue: label, default in-app + email-to-owner preferences.
export const NOTIFY_TYPES = {
  new_briefs:              { label: 'New monthly briefs received', app: true, email: true },
  project_added:           { label: 'New project added', app: true, email: false },
  sheet_change:            { label: 'Google Sheet change detected', app: true, email: true },
  auto_assigned:           { label: 'Projects automatically assigned', app: true, email: false },
  reassigned:              { label: 'Project manually reassigned', app: true, email: false },
  deadline_soon:           { label: 'Deadline approaching', app: true, email: true },
  overdue:                 { label: 'Project overdue', app: true, email: true },
  status_update:           { label: 'Project status updated', app: true, email: false },
  assignment_confirmation: { label: 'Teammate assignment confirmation', app: true, email: false },
  missing_info:            { label: 'Missing information in brief', app: true, email: true },
  assign_failed:           { label: 'Project could not be auto-assigned', app: true, email: true },
  sync_error:              { label: 'Sync error', app: true, email: true },
};
