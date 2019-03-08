workflow "Linting" {
  on = "push"
  resolves = ["Json"]
}

action "Json" {
  uses = "home-assistant/actions/jq@master"
  args = "**/*.json"
}
