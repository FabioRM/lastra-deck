# GitHub checks

Open **Apps → GitHub checks** and choose **Edit repositories**. Add up to four public repositories to `github-checks.json` in the Lastra user data folder. The optional `branch` filters workflow runs. The pull request list shows recent open and draft requests for the repository.

```json
{
  "version": 1,
  "repositories": [
    { "id": "example", "name": "Example project", "repository": "example-owner/example-repo", "branch": "main" }
  ]
}
```

Lastra uses GitHub’s public REST API while this view is visible. The view shows the latest workflow result per workflow and branch from the 20 most recent runs, and up to 10 open pull requests. Observed CI on a pull request comes from workflow runs for its current head commit in the sampled data. Tap a result to open its exact run or pull request on GitHub. [Workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository) · [Pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)

Successful readings stay in memory and refresh no more than every ten minutes. If GitHub is unavailable or rate limited, the view labels cached results and shows when it can retry. Clearing the repository list stops requests. Setup uses no sign-in and the provider makes public reads only. [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
