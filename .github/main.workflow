workflow "Linting" {
  on = "push"
  resolves = ["Json"]
}

action "Json" {
  uses = "home-assistant/actions/jq@master"
  args = "**/*.json"
}

workflow "Update S3" {
  on = "push"
  resolves = ["Push S3"]
}

action "Master" {
  uses = "actions/bin/filter@d820d56839906464fb7a57d1b4e1741cf5183efa"
  args = "branch master"
}

action "Push S3" {
  uses = "actions/aws/cli@efb074ae4510f2d12c7801e4461b65bf5e8317e6"
  needs = ["Master"]
  secrets = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
  args = "s3 sync . s3://hassio-version --exclude \"*\" --include \"*.json\" --include \"*.txt\""
}
