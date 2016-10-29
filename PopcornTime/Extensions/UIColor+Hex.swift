

import Foundation
import UIKit

extension UIColor {
    func hexString() -> String {
        let colorSpace = self.cgColor.colorSpace?.model
        let components = self.cgColor.components
        
        var r, g, b: CGFloat!
        
        if (colorSpace == .monochrome) {
            r = components?[0]
            g = components?[0]
            b = components?[0]
        } else if (colorSpace == .rgb) {
            r = components?[0]
            g = components?[1]
            b = components?[2]
        }
        
        return NSString(format: "#%02lX%02lX%02lX", lroundf(Float(r) * 255), lroundf(Float(g) * 255), lroundf(Float(b) * 255)) as String
    }
    
    func hexInt() -> UInt32 {
        let hex = hexString()
        var rgb: UInt32 = 0
        let s = Scanner(string: hex)
        s.scanLocation = 1
        s.scanHexInt32(&rgb)
        return rgb
    }
}
