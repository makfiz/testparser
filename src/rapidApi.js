import axios from 'axios';

const rapidapiKey = '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07';

export async function fetchGoogleFullProfiles(person) {
  const options = {
    method: 'POST',
    url: 'https://web-scraping-api2.p.rapidapi.com/google-full-profiles',
    headers: {
      'x-rapidapi-key': rapidapiKey,
      'x-rapidapi-host': 'web-scraping-api2.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    data: {
      name: `${person.first_name} ${person.last_name}`,
      company_name: trimCompanyName(person.company),
      job_title: '',
      location: '',
      keywords: '',
      limit: 1,
    },
  };
  // const options = {
  //   method: 'POST',
  //   url: 'https://fresh-linkedin-profile-data.p.rapidapi.com/google-full-profiles',
  //   headers: {
  //     'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
  //     'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  //     'Content-Type': 'application/json',
  //   },
  //   data: {
  //     name: `${person.first_name} ${person.last_name}`,
  //     company_name: `${person.company}`,
  //     job_title: '',
  //     location: '',
  //     keywords: '',
  //     limit: 1,
  //   },
  // };
  // console.log(options);
  try {
    const response = await axios.request(options);
    if (response.status === 200) {
      console.log(response?.data?.data ?? []);
      return response?.data?.data ?? [];
    } else {
      console.error(`Request failed with status ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchCompanyDataByDomain(email) {
  const domain = (/@(.+)$/.exec(email.toLowerCase()) || [])[1];
  const options = {
    method: 'GET',
    url: 'https://web-scraping-api2.p.rapidapi.com/get-company-by-domain',
    params: {
      domain: domain,
    },
    headers: {
      'x-rapidapi-key': rapidapiKey,
      'x-rapidapi-host': 'web-scraping-api2.p.rapidapi.com',
    },
  };
  // const options = {
  //   method: 'GET',
  //   url: 'https://fresh-linkedin-profile-data.p.rapidapi.com/get-company-by-domain',
  //   params: {
  //     domain: domain,
  //   },
  //   headers: {
  //     'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
  //     'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  //   },
  // };
  // console.log(options);
  try {
    const response = await axios.request(options);
    if (response.status === 200) {
      console.log(response.data);
      return response.data.data;
    } else {
      console.error(`Request failed with status ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
}

function trimCompanyName(company, maxLength = 35) {
  const words = company.split(/\s+/);
  let result = '';

  for (const word of words) {
    // Проверяем длину, если добавим слово (и пробел, если не первая итерация)
    const testString = result.length === 0 ? word : result + ' ' + word;
    if (testString.length > maxLength) {
      break;
    }
    result = testString;
  }

  return result;
}

// fetchGoogleFullProfiles({
//   first_name: 'Nigel',
//   last_name: 'Fletcher',
//   company:
//     'US Navy - Naval Air Warfare Center, Aircraft Division - Lakehurst - NAWC-AD',
// });
