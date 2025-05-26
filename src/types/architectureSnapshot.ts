// Architecture Snapshot Types

export interface ProjectSnapshot {
  id: string;
  version: string;
  timestamp: Date;
  projectPath: string;
  projectName: string;
  metadata: ProjectMetadata;
  structure: DirectoryStructure;
  dependencies: DependencyInfo;
  configuration: ConfigurationInfo;
  codeOrganization: CodeOrganization;
  apiSurface: APISurface;
  testing: TestingInfo;
  documentation: DocumentationInfo;
  metrics: ProjectMetrics;
}

export interface ProjectMetadata {
  name: string;
  version?: string;
  description?: string;
  repository?: string;
  author?: string;
  license?: string;
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  buildTools: BuildTool[];
  packageManager?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  javaVersion?: string;
}

export interface LanguageInfo {
  name: string;
  version?: string;
  percentage: number;
  fileCount: number;
  lineCount: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'testing' | 'build' | 'other';
}

export interface BuildTool {
  name: string;
  configFile: string;
  scripts?: Record<string, string>;
}

export interface DirectoryStructure {
  root: DirectoryNode;
  totalFiles: number;
  totalDirectories: number;
  maxDepth: number;
  conventions: NamingConvention[];
}

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  purpose?: string;
  children?: DirectoryNode[];
  fileStats?: FileStats;
}

export interface FileStats {
  extension: string;
  size: number;
  lines?: number;
  lastModified: Date;
}

export interface NamingConvention {
  pattern: string;
  description: string;
  examples: string[];
}

export interface DependencyInfo {
  direct: Dependency[];
  dev: Dependency[];
  peer?: Dependency[];
  totalCount: number;
  outdatedCount: number;
  vulnerableCount: number;
  licenses: LicenseInfo[];
}

export interface Dependency {
  name: string;
  version: string;
  latest?: string;
  description?: string;
  isOutdated?: boolean;
  vulnerabilities?: Vulnerability[];
  license?: string;
}

export interface Vulnerability {
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  cve?: string;
}

export interface LicenseInfo {
  name: string;
  count: number;
  packages: string[];
}

export interface ConfigurationInfo {
  environmentVariables: EnvVariable[];
  configFiles: ConfigFile[];
  featureFlags: FeatureFlag[];
  buildConfigs: BuildConfig[];
}

export interface EnvVariable {
  name: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  usedIn: string[];
}

export interface ConfigFile {
  path: string;
  type: string;
  purpose: string;
  schema?: any;
}

export interface FeatureFlag {
  name: string;
  description?: string;
  defaultValue: any;
  type: string;
}

export interface BuildConfig {
  name: string;
  environment: string;
  settings: Record<string, any>;
}

export interface CodeOrganization {
  entryPoints: EntryPoint[];
  modules: Module[];
  layers: ArchitecturalLayer[];
  patterns: DesignPattern[];
  conventions: CodingConvention[];
}

export interface EntryPoint {
  path: string;
  type: 'main' | 'cli' | 'web' | 'api' | 'worker' | 'test';
  description?: string;
}

export interface Module {
  name: string;
  path: string;
  exports: string[];
  imports: string[];
  purpose?: string;
}

export interface ArchitecturalLayer {
  name: string;
  directories: string[];
  purpose: string;
  dependencies: string[];
}

export interface DesignPattern {
  name: string;
  locations: string[];
  description: string;
}

export interface CodingConvention {
  type: string;
  description: string;
  examples: string[];
}

export interface APISurface {
  rest?: RESTEndpoint[];
  graphql?: GraphQLSchema;
  websocket?: WebSocketEvent[];
  cli?: CLICommand[];
  sdk?: SDKMethod[];
}

export interface RESTEndpoint {
  method: string;
  path: string;
  description?: string;
  parameters?: Parameter[];
  responses?: Response[];
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface Response {
  status: number;
  description: string;
  schema?: any;
}

export interface GraphQLSchema {
  types: string[];
  queries: string[];
  mutations: string[];
  subscriptions: string[];
}

export interface WebSocketEvent {
  name: string;
  direction: 'send' | 'receive' | 'both';
  description?: string;
  payload?: any;
}

export interface CLICommand {
  name: string;
  description?: string;
  options: CLIOption[];
  examples: string[];
}

export interface CLIOption {
  name: string;
  alias?: string;
  description?: string;
  required: boolean;
  type: string;
}

export interface SDKMethod {
  name: string;
  module: string;
  description?: string;
  parameters: Parameter[];
  returns: string;
}

export interface TestingInfo {
  framework: string;
  testFiles: number;
  testSuites: number;
  coverage?: CoverageInfo;
  types: TestType[];
}

export interface CoverageInfo {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export interface TestType {
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  count: number;
  locations: string[];
}

export interface DocumentationInfo {
  readmeFiles: DocFile[];
  apiDocs?: DocFile[];
  guides?: DocFile[];
  examples?: CodeExample[];
  commentDensity: number;
}

export interface DocFile {
  path: string;
  title: string;
  description?: string;
  lastUpdated: Date;
}

export interface CodeExample {
  title: string;
  path: string;
  language: string;
  description?: string;
}

export interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  complexity?: ComplexityMetrics;
  maintainability?: MaintainabilityScore;
}

export interface ComplexityMetrics {
  average: number;
  highest: number;
  highestFile: string;
}

export interface MaintainabilityScore {
  score: number;
  factors: Record<string, number>;
}

// Comparison types
export interface SnapshotComparison {
  previousSnapshot: ProjectSnapshot;
  currentSnapshot: ProjectSnapshot;
  changes: ArchitectureChanges;
  impact: ImpactAnalysis;
}

export interface ArchitectureChanges {
  metadata: ChangeSet<ProjectMetadata>;
  structure: ChangeSet<DirectoryNode>;
  dependencies: ChangeSet<Dependency>;
  configuration: ChangeSet<ConfigFile>;
  api: ChangeSet<any>;
  tests: ChangeSet<any>;
}

export interface ChangeSet<T> {
  added: T[];
  modified: T[];
  removed: T[];
}

export interface ImpactAnalysis {
  severity: 'low' | 'medium' | 'high' | 'critical';
  breakingChanges: string[];
  recommendations: string[];
  riskAreas: string[];
} 