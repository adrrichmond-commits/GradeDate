/** Authorization rules for grade-card requests.
 * Grade cards contain private percentile/profile information, so only the
 * authenticated owner may request a card by user ID.
 */
export function isGradeCardOwner(requestedUserId: number, currentUserId: number): boolean {
  return Number.isSafeInteger(requestedUserId) && requestedUserId > 0 && requestedUserId === currentUserId;
}
