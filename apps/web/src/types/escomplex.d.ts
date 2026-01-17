declare module "escomplex" {
  interface ComplexityReport {
    aggregate: {
      cyclomatic: number;
      halstead: {
        difficulty: number;
        effort: number;
        volume: number;
        length: number;
        vocabulary: number;
      };
      sloc: {
        physical: number;
        logical: number;
      };
      maintainability: number;
    };
    functions: Array<{
      name: string;
      cyclomatic: number;
      halstead: {
        difficulty: number;
        effort: number;
      };
      sloc: {
        physical: number;
        logical: number;
      };
    }>;
  }

  function analyse(source: string, options?: { loc?: boolean }): ComplexityReport;
  export = { analyse };
}
