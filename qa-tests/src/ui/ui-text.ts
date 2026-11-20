import { ClaimStatusValue } from '../constants/claim-rules';

/**
 * Every user-visible string the page objects locate by, copied from the demo-app-ui source.
 * When the UI copy changes, this is the only file to update.
 */
export const UiRoutes = {
  login: '/login',
  myClaims: '/claims',
  newClaim: '/claims/new',
  adminDashboard: '/admin/dashboard',
  adminClaims: '/admin/claims',
} as const;

export const LoginText = {
  heading: 'Log In',
  email: 'Email',
  password: 'Password',
  submit: 'Log In',
  invalidCredentials: 'Invalid email or password',
  invalidEmailFormat: 'Invalid email format',
  passwordRequired: 'Password is required',
} as const;

export const HeaderText = {
  myClaims: 'My Claims',
  submitClaim: 'Submit Claim',
  adminClaims: 'Claims',
  logout: 'Logout',
  welcome: (name: string) => `Welcome, ${name}`,
} as const;

export const MyClaimsText = {
  heading: 'My Claims',
  submitNew: 'Submit New Claim',
  emptyHeading: 'No claims yet',
  viewDetailsTestId: 'view-details-button',
  descriptionMaxChars: 50,
  ellipsis: '...',
  claimIdPrefixLength: 8,
} as const;

export const ClaimDetailText = {
  modalTestId: 'claim-detail-modal',
  dialogName: 'Claim Details',
  close: 'Close',
  notAuthorized: 'You are not authorized to view this claim.',
  notFound: 'Claim not found.',
} as const;

export const WizardText = {
  heading: 'Submit New Claim',
  step1TestId: 'wizard-step-1',
  step2TestId: 'wizard-step-2',
  step3TestId: 'wizard-step-3',
  incidentDate: 'When did the incident occur?',
  incidentLocation: 'Where did the incident occur?',
  claimAmount: 'Claim Amount',
  description: 'Describe what happened',
  next: 'Next',
  back: 'Back',
  submit: 'Submit Claim',
  cancel: 'Cancel',
  cancelDialog: 'Cancel Claim Submission?',
  keepEditing: 'Keep Editing',
  discard: 'Discard & Leave',
  successToastPrefix: 'Claim submitted successfully! Claim ID:',
  errors: {
    futureDate: 'Incident date cannot be in the future',
    locationTooShort: 'Location must be at least 5 characters',
    amountTooSmall: 'Claim amount must be at least $0.01',
    amountTooLarge: 'Claim amount cannot exceed $1,000,000',
    amountRequired: 'Claim amount is required',
    descriptionTooShort: 'Description must be at least 10 characters',
  },
  reviewLabels: { date: 'Incident Date', location: 'Location', amount: 'Claim Amount', description: 'Description' },
} as const;

export const AdminClaimsText = {
  heading: 'Claims Management',
  statusFilter: 'Filter claims by status',
  allStatuses: 'All Statuses',
  searchUserId: 'Search claims by user ID',
  clearFilters: 'Clear Filters',
  statusSelectTestId: (claimIdPrefix: string) => `status-select-${claimIdPrefix}`,
  noTransitions: 'No status transitions available',
  confirmDialog: 'Confirm Status Change',
  confirm: 'Confirm',
  cancel: 'Cancel',
  updatedToast: (label: string) => `Claim status updated to ${label}`,
  loadError: 'Failed to load claims. Please try again.',
} as const;

export const RealtimeText = {
  claimantStatusToast: (claimIdPrefix: string, status: string) =>
    `Your claim #${claimIdPrefix}… status changed to ${status}`,
  adminNewClaimToast: (claimIdPrefix: string) => `New claim submitted: ${claimIdPrefix}…`,
  connectionLive: 'Connection status: Live',
} as const;

export const StatusLabel: Record<ClaimStatusValue, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export const statusBadgeName = (status: ClaimStatusValue) => `Claim status: ${StatusLabel[status]}`;
