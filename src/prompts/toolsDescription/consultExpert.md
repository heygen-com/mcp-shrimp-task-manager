Consults an external AI expert (OpenAI) when the primary agent is stuck on a problem. Provide the problem description and relevant context to get a suggestion.

**Important Usage Notes:**

*   **Stateless Nature:** This tool is stateless. Each call is treated as an independent interaction and does not retain memory of previous calls. The calling agent (AI) is responsible for providing all necessary historical context for follow-up questions.
*   **Context for Follow-ups:** When asking follow-up questions based on previous expert advice:
    *   The `relevant_context` parameter **MUST** include a concise summary of the prior interaction and the specific advice being referenced.
    *   The `problem_description` should clearly state the new, focused question building upon the previous response.
*   **Structured Q&A Recommended:** For multi-turn consultations, adopt a structured Q&A approach. Analyze the expert's response with the user, formulate a specific follow-up question, and provide concise, relevant context in the next call. Do not expect a free-flowing conversational memory from the tool itself.

**Example of Follow-up Context:**

*   **Initial Call:**
    *   `problem_description`: "How should we structure the authentication flow for service X?"
    *   `relevant_context`: "Service X uses OAuth2, integrates with identity provider Y..."
    *   *Expert Response:* "Recommend using the Authorization Code flow with PKCE. Key steps are 1, 2, 3..."
*   **Follow-up Call:**
    *   `problem_description`: "Need clarification on handling token refresh in step 3 of the recommended auth flow."
    *   `relevant_context`: "Following up on your recommendation to use Authorization Code flow with PKCE for service X. Step 3 involves token refresh. Our client library Z has limitations regarding background refresh. How can we adapt step 3 considering library Z?" 