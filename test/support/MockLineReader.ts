import LineReader from "../../src/utils/LineReader";

class MockLineReader extends LineReader {
    private lines:string[];

    constructor(lines?:string[]) {
        super();
        this.lines = lines || [];
    }

    public readLines(envFile: string) {
        return this.lines;
    }
}

export default MockLineReader;