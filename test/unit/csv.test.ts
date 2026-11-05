import { describe, expect, it } from 'vitest';
import { CsvError, csvRecords, parseCsv } from '../../src/career/csv.js';

describe('CSV parser', () => {
  it('parses basic CSV rows and unquotes fields', () => {
    const text = 'name,role,years\nAlice,Developer,5\nBob,"Product, Lead",8\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'role', 'years'],
      ['Alice', 'Developer', '5'],
      ['Bob', 'Product, Lead', '8'],
    ]);
  });

  it('handles CRLF and escaped quotes', () => {
    const text = 'title,summary\r\n"Lead ""Specialist""","Line 1\nLine 2"\r\n';
    expect(parseCsv(text)).toEqual([
      ['title', 'summary'],
      ['Lead "Specialist"', 'Line 1\nLine 2'],
    ]);
  });

  it('strips leading UTF-8 BOM', () => {
    const text = '\uFEFFCompany,Title\nAcme,Engineer\n';
    expect(parseCsv(text)).toEqual([
      ['Company', 'Title'],
      ['Acme', 'Engineer'],
    ]);
  });

  it('throws CsvError on unclosed quote', () => {
    expect(() => parseCsv('name,desc\nAlice,"unclosed')).toThrow(CsvError);
  });

  it('throws CsvError on quote in the middle of unquoted field', () => {
    expect(() => parseCsv('name\nAl"ice')).toThrow(CsvError);
  });

  it('enforces row limits', () => {
    const text = 'a\nb\nc\nd\n';
    expect(() => parseCsv(text, { maxRows: 2, maxFields: 10, maxFieldChars: 100 })).toThrow(CsvError);
  });

  it('enforces field limits', () => {
    const text = 'a,b,c,d\n';
    expect(() => parseCsv(text, { maxRows: 10, maxFields: 3, maxFieldChars: 100 })).toThrow(CsvError);
  });

  it('enforces field character limits', () => {
    const text = 'a,' + 'x'.repeat(50) + '\n';
    expect(() => parseCsv(text, { maxRows: 10, maxFields: 10, maxFieldChars: 40 })).toThrow(CsvError);
  });

  it('csvRecords returns records keyed by lowercase headers', () => {
    const text = 'Notes: Exported from LinkedIn\nCompany Name,Title,Started On\nAcme Corp,Engineer,2021\n';
    const recs = csvRecords(text, ['Company Name', 'Title']);
    expect(recs).toEqual([{ 'company name': 'Acme Corp', title: 'Engineer', 'started on': '2021' }]);
  });

  it('csvRecords returns null when required header is missing', () => {
    const text = 'Col1,Col2\nVal1,Val2\n';
    expect(csvRecords(text, ['Company Name'])).toBeNull();
  });
});
