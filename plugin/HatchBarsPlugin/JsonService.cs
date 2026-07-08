using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;

namespace HatchBarsPlugin
{
    // In-box .NET Framework JSON (no Newtonsoft dependency to ship/resolve
    // inside accoreconsole). Reads/writes files in the job working directory.
    public static class JsonService
    {
        public static T Read<T>(string path)
        {
            using (var stream = File.OpenRead(path))
            {
                var serializer = new DataContractJsonSerializer(typeof(T));
                return (T)serializer.ReadObject(stream);
            }
        }

        public static void Write(object value, string path)
        {
            using (var stream = new MemoryStream())
            {
                var serializer = new DataContractJsonSerializer(value.GetType());
                serializer.WriteObject(stream, value);
                File.WriteAllBytes(path, stream.ToArray());
            }
        }
    }
}
