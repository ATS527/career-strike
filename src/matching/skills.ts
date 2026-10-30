// Skills Career Strike can recognise in posting text. Each entry is a canonical name plus the
// spellings employers use. Deliberately excludes ambiguous one-letter or common-word names
// ("C", "R", "Go") unless written unambiguously, to avoid inventing requirements.

export interface SkillEntry {
  name: string;
  aliases: readonly string[];
}

const S = (name: string, ...aliases: string[]): SkillEntry => ({ name, aliases: [name, ...aliases] });
/** For skills whose plain name is an ordinary English word: only the listed spellings count. */
const Only = (name: string, ...aliases: string[]): SkillEntry => ({ name, aliases });

export const SKILLS: readonly SkillEntry[] = [
  // Languages
  S('JavaScript', 'JS', 'ECMAScript'),
  S('TypeScript'),
  S('Python'),
  S('Java'),
  S('Kotlin'),
  S('Scala'),
  Only('Go', 'Golang', 'Go language', 'Go (Golang)'),
  S('Rust'),
  S('C++', 'CPP'),
  S('C#', 'C Sharp', '.NET', 'dotnet'),
  S('Ruby'),
  S('PHP'),
  S('Swift'),
  S('Objective-C'),
  S('Elixir'),
  S('Erlang'),
  S('Haskell'),
  S('Clojure'),
  S('Dart'),
  S('Lua'),
  S('Perl'),
  S('Bash', 'shell scripting'),
  S('SQL'),
  S('GraphQL'),
  S('Solidity'),
  // Web and mobile
  S('React', 'React.js', 'ReactJS'),
  S('React Native'),
  S('Next.js', 'NextJS'),
  S('Vue', 'Vue.js', 'VueJS'),
  S('Angular'),
  S('Svelte'),
  S('Node.js', 'NodeJS'),
  Only('Express', 'Express.js', 'ExpressJS'),
  S('Django'),
  S('Flask'),
  S('FastAPI'),
  S('Spring', 'Spring Boot'),
  S('Ruby on Rails', 'Rails'),
  S('Laravel'),
  S('HTML'),
  S('CSS'),
  S('Tailwind', 'Tailwind CSS'),
  S('iOS'),
  S('Android'),
  S('Flutter'),
  S('SwiftUI'),
  S('Jetpack Compose'),
  S('Web accessibility', 'WCAG', 'a11y', 'digital accessibility'),
  // Data and ML
  S('PostgreSQL', 'Postgres'),
  S('MySQL'),
  S('SQLite'),
  S('MongoDB', 'Mongo'),
  S('Redis'),
  S('Cassandra'),
  S('DynamoDB'),
  S('Elasticsearch', 'OpenSearch'),
  S('Snowflake'),
  S('BigQuery'),
  S('Redshift'),
  S('Databricks'),
  S('Apache Spark', 'Spark', 'PySpark'),
  S('Apache Kafka', 'Kafka'),
  S('Apache Airflow', 'Airflow'),
  S('dbt'),
  S('Hadoop'),
  S('Pandas'),
  S('NumPy'),
  S('scikit-learn', 'sklearn'),
  S('PyTorch'),
  S('TensorFlow'),
  S('JAX'),
  S('Machine learning', 'ML'),
  S('Deep learning'),
  S('Large language models', 'LLM', 'LLMs'),
  S('Natural language processing', 'NLP'),
  S('Computer vision'),
  S('Statistics', 'statistical analysis'),
  S('A/B testing', 'AB testing', 'split testing'),
  S('Data modeling', 'data modelling'),
  S('ETL', 'ELT', 'data pipelines'),
  S('Tableau'),
  S('Power BI', 'PowerBI'),
  S('Looker'),
  S('Excel', 'Microsoft Excel'),
  // Cloud and infrastructure
  S('AWS', 'Amazon Web Services'),
  S('Google Cloud', 'GCP', 'Google Cloud Platform'),
  S('Azure', 'Microsoft Azure'),
  S('Kubernetes', 'K8s'),
  S('Docker'),
  S('Terraform'),
  S('Ansible'),
  S('Helm'),
  S('Linux'),
  S('CI/CD', 'continuous integration', 'continuous delivery'),
  S('GitHub Actions'),
  S('Jenkins'),
  S('Prometheus'),
  S('Grafana'),
  S('Datadog'),
  S('Observability', 'OpenTelemetry'),
  S('Site reliability engineering', 'SRE'),
  S('Distributed systems'),
  S('Microservices'),
  S('System design'),
  S('REST', 'RESTful APIs', 'REST APIs'),
  S('gRPC'),
  S('Computer networking', 'TCP/IP', 'network engineering'),
  S('Security', 'information security', 'cybersecurity'),
  S('Identity and access management', 'IAM', 'OAuth', 'SSO'),
  S('Penetration testing', 'pentesting'),
  // Practices and product
  S('Agile', 'Scrum', 'Kanban'),
  S('Test-driven development', 'TDD'),
  S('Unit testing', 'automated testing', 'test automation'),
  S('Playwright'),
  S('Cypress'),
  S('Selenium'),
  S('Git'),
  S('Code review'),
  S('Technical leadership', 'tech lead'),
  S('People management', 'managing engineers', 'line management'),
  S('Mentoring', 'mentorship'),
  S('Product management'),
  S('Roadmapping', 'product roadmap'),
  S('User research', 'UX research'),
  S('UX design', 'user experience design'),
  S('UI design', 'interface design'),
  S('Figma'),
  S('Design systems'),
  S('Prototyping'),
  S('Stakeholder management'),
  S('Project management'),
  S('Technical writing', 'technical documentation'),
  // Business functions
  S('Salesforce'),
  S('HubSpot'),
  S('B2B sales', 'enterprise sales'),
  S('Account management'),
  S('Customer success'),
  S('Customer support'),
  S('Digital marketing'),
  S('SEO', 'search engine optimization'),
  S('Content marketing'),
  S('Financial modeling', 'financial modelling'),
  S('Accounting'),
  S('Recruiting', 'talent acquisition'),
  S('Operations management'),
  S('Supply chain'),
];

/** Regexes for an entry: whole-word, case-insensitive, punctuation-aware ("C++", "Node.js"). */
function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9+#.])${escaped}(?![A-Za-z0-9+#])`, 'i');
}

// Names that are also English words match only when capitalised as a proper noun.
const CASE_SENSITIVE = new Set(['React', 'Excel', 'Vue', 'Spark', 'Rails', 'Swift', 'Dart', 'Spring', 'Angular', 'Agile', 'Security', 'Accounting', 'Docker', 'Helm']);

const COMPILED = SKILLS.map((s) => ({
  name: s.name,
  patterns: s.aliases.map((a) => (CASE_SENSITIVE.has(a) ? new RegExp(aliasPattern(a).source) : aliasPattern(a))),
}));

/** Canonical skill names mentioned in a text. */
export function skillsIn(text: string): string[] {
  return COMPILED.filter((s) => s.patterns.some((p) => p.test(text))).map((s) => s.name);
}

const BY_ALIAS = new Map(SKILLS.flatMap((s) => [s.name, ...s.aliases].map((a) => [a.toLowerCase().replace(/\s+/g, ' '), s.name] as const)));

/** Canonical name for a skill a candidate typed, if it is exactly a known name or spelling. */
export function canonicalSkill(input: string): string | null {
  return BY_ALIAS.get(input.trim().toLowerCase().replace(/\s+/g, ' ')) ?? null;
}

export function mentions(text: string, phrase: string): boolean {
  return aliasPattern(phrase).test(text);
}
