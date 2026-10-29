export function findReferrerUrl(company: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}%20software%20engineer`;
}

export function hiringPostsUrl(company: string): string {
  return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(company)}%20hiring&sortBy=%22date_posted%22`;
}
