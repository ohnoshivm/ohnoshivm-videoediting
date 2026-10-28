#!/usr/bin/env swift
/**
 * shorts-matte.swift --in <video> --out <dir> [--quality accurate|balanced|fast]
 *                    [--samples 24] [--raw <file>] [--no-masks]
 *
 * Apple Vision pass over an a-roll for the split layout's pop-out face card.
 *
 * 1. VNGeneratePersonSegmentationRequest on every frame (default .balanced).
 * 2. VNDetectFaceRectanglesRequest on --samples evenly spaced frames.
 *
 * Writes:
 *   <dir>/person.rgba   raw 4:4:4 RGBA frames, A = person matte (top-down rows)
 *   <dir>/face.json     normalized medians {cx, cy, w, h, eyeY}, top-left origin
 *
 * The RGBA file is encoded to VP9 + alpha by shorts-prep.mjs (or by hand:
 *   ffmpeg -f rawvideo -pix_fmt rgba -s 1080x1920 -r 30 -i person.rgba \
 *     -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 20 -auto-alt-ref 0 \
 *     -metadata:s:v:0 alpha_mode=1 person.webm )
 *
 * eyeY is defined as top + 0.38 * h, the eye line of a face box.
 */
import Foundation
import AVFoundation
import Vision
import Accelerate

/* ------------------------------------------------------------------ args */

func stderrLine(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

func die(_ message: String) -> Never {
    stderrLine("shorts-matte: \(message)")
    exit(1)
}

let argv = CommandLine.arguments
func arg(_ name: String, _ fallback: String? = nil) -> String? {
    guard let i = argv.firstIndex(of: "--\(name)"), i + 1 < argv.count else { return fallback }
    return argv[i + 1]
}

guard let inputPath = arg("in") else {
    die("missing --in <video>")
}
guard let outDir = arg("out") else {
    die("missing --out <dir>")
}
let qualityName = arg("quality", "balanced")!
let sampleCount = Int(arg("samples", "24")!) ?? 24
let rawPath = arg("raw", (outDir as NSString).appendingPathComponent("person.rgba"))!

let quality: VNGeneratePersonSegmentationRequest.QualityLevel
switch qualityName {
case "accurate": quality = .accurate
case "balanced": quality = .balanced
case "fast": quality = .fast
default: die("invalid --quality \"\(qualityName)\" (accurate, balanced, fast)")
}

let inputURL = URL(fileURLWithPath: inputPath)
guard FileManager.default.fileExists(atPath: inputPath) else {
    die("input not found: \(inputPath)")
}
try? FileManager.default.createDirectory(
    atPath: outDir, withIntermediateDirectories: true, attributes: nil)

/* --------------------------------------------------------------- reading */

let asset = AVURLAsset(url: inputURL)
guard let track = asset.tracks(withMediaType: .video).first else {
    die("no video track in \(inputPath)")
}

let natural = track.naturalSize.applying(track.preferredTransform)
let width = Int(abs(natural.width).rounded())
let height = Int(abs(natural.height).rounded())
let fps = Double(track.nominalFrameRate) > 0 ? Double(track.nominalFrameRate) : 30
let estimate = max(1, Int((CMTimeGetSeconds(asset.duration) * fps).rounded()))

guard width > 0, height > 0 else { die("could not read the video's dimensions") }

let reader: AVAssetReader
do {
    reader = try AVAssetReader(asset: asset)
} catch {
    die("AVAssetReader: \(error.localizedDescription)")
}
let output = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData = false
guard reader.canAdd(output) else { die("cannot add a 32BGRA reader output") }
reader.add(output)
guard reader.startReading() else {
    die("AVAssetReader did not start: \(reader.error?.localizedDescription ?? "unknown")")
}

/* ---------------------------------------------------------------- writer */

let rawURL = URL(fileURLWithPath: rawPath)
FileManager.default.createFile(atPath: rawPath, contents: nil, attributes: nil)
guard let handle = try? FileHandle(forWritingTo: rawURL) else {
    die("cannot write \(rawPath)")
}

let segmentation = VNGeneratePersonSegmentationRequest()
segmentation.qualityLevel = quality
segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8

let faceEvery = max(1, estimate / max(1, sampleCount))
var faces: [(cx: Double, cy: Double, w: Double, h: Double)] = []
var eyes: [Double] = []

var frame = [UInt8](repeating: 0, count: width * height * 4)
var mask = [UInt8](repeating: 0, count: width * height)
var personFrames = 0
var index = 0

stderrLine("shorts-matte  \(width)x\(height)  \(fps) fps  ~\(estimate) frames  quality \(qualityName)")

while let sample = output.copyNextSampleBuffer() {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else { continue }

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
    var requests: [VNRequest] = [segmentation]

    let detectFaceNow = faces.count < sampleCount && index % faceEvery == 0
    let faceRequest = VNDetectFaceLandmarksRequest()
    if detectFaceNow { requests.append(faceRequest) }

    do {
        try handler.perform(requests)
    } catch {
        die("Vision failed on frame \(index): \(error.localizedDescription)")
    }

    if detectFaceNow, let observations = faceRequest.results, !observations.isEmpty {
        // The subject is the largest face in the frame.
        if let biggest = observations.max(by: { $0.boundingBox.width * $0.boundingBox.height <
                                                $1.boundingBox.width * $1.boundingBox.height }) {
            let box = biggest.boundingBox // normalized, origin bottom-left
            if box.width > 0.04 {
                faces.append((
                    cx: Double(box.midX),
                    cy: Double(1 - box.midY),
                    w: Double(box.width),
                    h: Double(box.height)))
                // Measured eye line: mean of the two pupils, in frame coordinates
                // with a top-left origin. Falls back to 0.38 h in the summary.
                if let landmarks = biggest.landmarks,
                   let left = landmarks.leftPupil ?? landmarks.leftEye,
                   let right = landmarks.rightPupil ?? landmarks.rightEye {
                    let leftY = left.normalizedPoints.map { Double($0.y) }
                    let rightY = right.normalizedPoints.map { Double($0.y) }
                    let meanY = (leftY.reduce(0, +) / Double(leftY.count) +
                                 rightY.reduce(0, +) / Double(rightY.count)) / 2
                    eyes.append(1 - (Double(box.minY) + meanY * Double(box.height)))
                }
            }
        }
    }

    // ---- matte: Vision mask -> full-res 8-bit alpha via vImage
    mask.withUnsafeMutableBytes { raw -> Void in
        memset(raw.baseAddress!, 0, width * height)
        guard let observation = segmentation.results?.first else { return }
        let buffer = observation.pixelBuffer
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let source = CVPixelBufferGetBaseAddress(buffer) else { return }
        let maskW = CVPixelBufferGetWidth(buffer)
        let maskH = CVPixelBufferGetHeight(buffer)
        var from = vImage_Buffer(
            data: source,
            height: vImagePixelCount(maskH),
            width: vImagePixelCount(maskW),
            rowBytes: CVPixelBufferGetBytesPerRow(buffer))
        var to = vImage_Buffer(
            data: raw.baseAddress!,
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: width)
        let error = vImageScale_Planar8(&from, &to, nil, vImage_Flags(kvImageHighQualityResampling))
        if error != kvImageNoError {
            memset(raw.baseAddress!, 0, width * height)
        }
        personFrames += 1
    }

    // ---- compose straight-alpha RGBA from BGRA + mask
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let source = CVPixelBufferGetBaseAddress(pixelBuffer) else { continue }
    let rowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let src = source.assumingMemoryBound(to: UInt8.self)

    frame.withUnsafeMutableBufferPointer { dst -> Void in
        mask.withUnsafeBufferPointer { alpha -> Void in
            for y in 0..<height {
                let s = src + y * rowBytes
                let a = alpha.baseAddress! + y * width
                let d = dst.baseAddress! + y * width * 4
                for x in 0..<width {
                    let i = x * 4
                    d[i + 0] = s[i + 2]
                    d[i + 1] = s[i + 1]
                    d[i + 2] = s[i + 0]
                    d[i + 3] = a[x]
                }
            }
        }
    }

    frame.withUnsafeBytes { bytes -> Void in
        handle.write(Data(bytes: bytes.baseAddress!, count: bytes.count))
    }

    index += 1
    if index % 30 == 0 || index == estimate {
        stderrLine("  matte \(index)/\(estimate)")
    }
}

if reader.status == .failed {
    die("reader failed: \(reader.error?.localizedDescription ?? "unknown")")
}
try? handle.close()

guard index > 0 else { die("no frames decoded") }
guard !faces.isEmpty else { die("no face found in any sampled frame — is the subject facing the camera?") }

/* ------------------------------------------------------------ face.json */

func median(_ values: [Double]) -> Double {
    let sorted = values.sorted()
    let mid = sorted.count / 2
    return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

let cx = median(faces.map { $0.cx })
let cy = median(faces.map { $0.cy })
let w = median(faces.map { $0.w })
let h = median(faces.map { $0.h })
let boxTop = cy - h / 2
// Measured pupils when Vision finds them, otherwise the 0.38 h rule of thumb.
let eyeY = eyes.isEmpty ? boxTop + 0.38 * h : median(eyes)

let faceJSON = String(
    format: "{\n  \"cx\": %.4f,\n  \"cy\": %.4f,\n  \"w\": %.4f,\n  \"h\": %.4f,\n  \"eyeY\": %.4f\n}\n",
    cx, cy, w, h, eyeY)
try! faceJSON.write(
    to: URL(fileURLWithPath: (outDir as NSString).appendingPathComponent("face.json")),
    atomically: true, encoding: .utf8)

let mb = Double(index * width * height * 4) / 1_048_576
stderrLine(String(format:
    "\n  %d frames · %d with a person · %d face samples · %d eye samples\n  raw %.0f MB → %@\n  cx %.3f  cy %.3f  w %.3f  h %.3f  eyeY %.3f",
    index, personFrames, faces.count, eyes.count, mb, rawPath, cx, cy, w, h, eyeY))
