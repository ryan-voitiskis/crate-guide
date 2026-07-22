import {
	CLOUD_ACCOUNT_WORKSPACE_PREFIX,
	CLOUD_SIGNED_OUT_WORKSPACE_ID
} from '../../shared/constants/theme'

export function createCloudWorkspaceId(userId: string | null): string {
	return userId
		? `${CLOUD_ACCOUNT_WORKSPACE_PREFIX}${encodeURIComponent(userId)}`
		: CLOUD_SIGNED_OUT_WORKSPACE_ID
}
