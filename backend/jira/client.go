package jira

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/w-bud/backend/models"
)

type Client struct {
	BaseURL    string
	Email      string
	APIToken   string
	HTTPClient *http.Client
}

func NewClient(cfg models.JIRAConfig) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		Email:      cfg.Email,
		APIToken:   cfg.APIToken,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) doRequest(method, path string) ([]byte, error) {
	reqURL := c.BaseURL + path
	req, err := http.NewRequest(method, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	// Basic auth: email:api_token for Cloud, or token as Bearer for Server PAT
	if c.Email != "" && c.APIToken != "" {
		req.SetBasicAuth(c.Email, c.APIToken)
	} else if c.APIToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIToken)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("JIRA request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("JIRA API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 500)]))
	}

	return body, nil
}

// --- JIRA Agile API response types ---

type sprintListResponse struct {
	Values []sprintValue `json:"values"`
}

type sprintValue struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
	Goal  string `json:"goal"`
}

type issueSearchResponse struct {
	Issues []jiraIssue `json:"issues"`
}

type jiraIssue struct {
	Key    string      `json:"key"`
	Fields issueFields `json:"fields"`
}

type issueFields struct {
	Summary            string          `json:"summary"`
	Status             issueStatus     `json:"status"`
	Priority           *issuePriority  `json:"priority"`
	Description        json.RawMessage `json:"description"`
	AcceptanceCriteria json.RawMessage `json:"customfield_10038"`
	StoryPoints        json.RawMessage `json:"customfield_10026"`
	Subtasks           []jiraSubtask   `json:"subtasks"`
	Components         []jiraComponent `json:"components"`
	Labels             []string        `json:"labels"`
}

type issueStatus struct {
	Name string `json:"name"`
}

type issuePriority struct {
	Name string `json:"name"`
}

type jiraSubtask struct {
	Key    string        `json:"key"`
	Fields subtaskFields `json:"fields"`
}

type subtaskFields struct {
	Summary string      `json:"summary"`
	Status  issueStatus `json:"status"`
}

type jiraComponent struct {
	Name string `json:"name"`
}

// --- Public methods ---

// SprintInfo holds basic sprint metadata returned by GetSprints.
type SprintInfo struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

// GetSprints returns active and future sprints for the given board.
func (c *Client) GetSprints(boardID string) ([]SprintInfo, error) {
	path := fmt.Sprintf("/rest/agile/1.0/board/%s/sprint?state=active,future", boardID)
	body, err := c.doRequest("GET", path)
	if err != nil {
		return nil, err
	}
	var resp sprintListResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parsing sprint response: %w", err)
	}
	sprints := make([]SprintInfo, 0, len(resp.Values))
	for _, v := range resp.Values {
		sprints = append(sprints, SprintInfo{ID: v.ID, Name: v.Name, State: v.State})
	}
	return sprints, nil
}

// GetActiveSprint returns the active sprint ID and name for the given board.
func (c *Client) GetActiveSprint(boardID string) (int, string, error) {
	path := fmt.Sprintf("/rest/agile/1.0/board/%s/sprint?state=active", boardID)
	body, err := c.doRequest("GET", path)
	if err != nil {
		return 0, "", err
	}

	var resp sprintListResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, "", fmt.Errorf("parsing sprint response: %w", err)
	}

	if len(resp.Values) == 0 {
		return 0, "", fmt.Errorf("no active sprint found for board %s", boardID)
	}

	sprint := resp.Values[0]
	return sprint.ID, sprint.Name, nil
}

// GetSprintStories fetches stories assigned to current user from the active sprint.
func (c *Client) GetSprintStories(sprintID int) ([]models.Story, error) {
	jql := url.QueryEscape("issuetype = Story AND assignee = currentUser()")
	fields := "summary,status,description,customfield_10026,customfield_10038,subtasks,priority,components,labels"
	path := fmt.Sprintf("/rest/agile/1.0/sprint/%d/issue?fields=%s&jql=%s&maxResults=100", sprintID, fields, jql)

	body, err := c.doRequest("GET", path)
	if err != nil {
		return nil, err
	}

	var resp issueSearchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parsing issues response: %w", err)
	}

	stories := make([]models.Story, 0, len(resp.Issues))
	for _, issue := range resp.Issues {
		points := 0
		if len(issue.Fields.StoryPoints) > 0 && string(issue.Fields.StoryPoints) != "null" {
			// Try float first, then string
			var f float64
			if err := json.Unmarshal(issue.Fields.StoryPoints, &f); err == nil {
				points = int(f)
			} else {
				var s string
				if err := json.Unmarshal(issue.Fields.StoryPoints, &s); err == nil {
					if parsed, e := strconv.ParseFloat(s, 64); e == nil {
						points = int(parsed)
					}
				}
			}
		}

		priority := "Medium"
		if issue.Fields.Priority != nil {
			priority = issue.Fields.Priority.Name
		}

		var components []string
		for _, comp := range issue.Fields.Components {
			components = append(components, comp.Name)
		}
		// Fall back to labels if no components
		if len(components) == 0 {
			components = issue.Fields.Labels
		}

		var subtasks []models.Subtask
		for _, st := range issue.Fields.Subtasks {
			subtasks = append(subtasks, models.Subtask{
				ID:      st.Key,
				Summary: st.Fields.Summary,
				Status:  st.Fields.Status.Name,
			})
		}

		// Parse description (can be ADF object or plain string)
		description := parseRawText(issue.Fields.Description)

		// Parse acceptance criteria (customfield_10038)
		acceptanceCriteria := parseRawText(issue.Fields.AcceptanceCriteria)

		stories = append(stories, models.Story{
			ID:                 issue.Key,
			Summary:            issue.Fields.Summary,
			Description:        description,
			AcceptanceCriteria: acceptanceCriteria,
			Status:             issue.Fields.Status.Name,
			Priority:           priority,
			Points:             points,
			Components:         components,
			Subtasks:           subtasks,
		})
	}

	return stories, nil
}

// FetchSprint fetches stories. If overrideSprintID is provided, uses that directly;
// otherwise auto-detects the current active sprint from the board.
func (c *Client) FetchSprint(boardID string, overrideSprintID string) (models.StoriesFile, error) {
	var sprintID int
	var sprintName string

	if overrideSprintID != "" {
		// Use the explicitly provided sprint ID
		parsed, err := strconv.Atoi(overrideSprintID)
		if err != nil {
			return models.StoriesFile{}, fmt.Errorf("invalid sprint_id %q: %w", overrideSprintID, err)
		}
		sprintID = parsed
		sprintName = fmt.Sprintf("Sprint %d", sprintID)
	} else {
		// Auto-detect active sprint from the board
		var err error
		sprintID, sprintName, err = c.GetActiveSprint(boardID)
		if err != nil {
			return models.StoriesFile{}, fmt.Errorf("getting active sprint: %w", err)
		}
	}

	stories, err := c.GetSprintStories(sprintID)
	if err != nil {
		return models.StoriesFile{}, fmt.Errorf("getting sprint stories: %w", err)
	}

	return models.StoriesFile{
		SprintID:    fmt.Sprintf("SP-%d", sprintID),
		SprintName:  sprintName,
		LastFetched: time.Now(),
		Stories:     stories,
	}, nil
}

// parseRawText extracts plain text from a json.RawMessage that could be:
// - null
// - a plain JSON string: "some text"
// - an ADF object: {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}
func parseRawText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}

	// Try plain string first
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}

	// Try ADF (Atlassian Document Format) — extract all text nodes
	var doc adfDoc
	if err := json.Unmarshal(raw, &doc); err == nil {
		return extractADFText(doc.Content)
	}

	// Fallback: return raw string
	return string(raw)
}

type adfDoc struct {
	Type    string    `json:"type"`
	Content []adfNode `json:"content"`
}

type adfNode struct {
	Type    string    `json:"type"`
	Text    string    `json:"text"`
	Content []adfNode `json:"content"`
}

func extractADFText(nodes []adfNode) string {
	var result strings.Builder
	for _, node := range nodes {
		if node.Text != "" {
			result.WriteString(node.Text)
		}
		if len(node.Content) > 0 {
			result.WriteString(extractADFText(node.Content))
		}
		if node.Type == "paragraph" || node.Type == "heading" || node.Type == "bulletList" || node.Type == "orderedList" || node.Type == "listItem" {
			result.WriteString("\n")
		}
	}
	return strings.TrimSpace(result.String())
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
