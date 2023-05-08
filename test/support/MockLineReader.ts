import LineReader from "../../src/utils/LineReader";

class MockLineReader extends LineReader {
    private lines:any[];

    constructor(lines?:any[]) {
        super();
        this.lines = lines || [];
    }

    public readLines(envFile: string) {
        return this.lines;
    }
}

export default MockLineReader;